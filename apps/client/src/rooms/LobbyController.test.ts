import type { Room } from '@colyseus/sdk';
import type { PatientRecord, PlayerPresence } from '@pokecenter/shared';
import { describe, expect, it, vi } from 'vitest';
import { LobbyController, type LobbyGateway, type LobbyView } from './LobbyController.js';

function setup(storage?: Storage) {
  const messages = new Map<string, (value: never) => void>();
  let stateChange: ((state: unknown) => void) | undefined;
  let disconnected: (() => void) | undefined;
  let dropped: (() => void) | undefined;
  let reconnected: (() => void) | undefined;
  const room = {
    sessionId: 'host-id',
    reconnectionToken: 'room-1:secret',
    reconnection: { minUptime: 5000 },
    state: { players: new Map([['host-id', { x: 456, y: 422, facing: 'up', carriedPatientId: '' }]]),
      phase: 'lobby', hostId: 'host-id', countdownRemainingMs: 0, roundId: '' },
    leave: vi.fn(async () => 1000),
    send: vi.fn(),
    onMessage: vi.fn((type, listener) => { messages.set(type, listener); }),
    onStateChange: vi.fn((listener) => { stateChange = listener; }),
    onLeave: vi.fn((listener) => { disconnected = listener; }),
    onDrop: vi.fn((listener) => { dropped = listener; }),
    onReconnect: vi.fn((listener) => { reconnected = listener; }),
  } as unknown as Room;
  const gateway: LobbyGateway = {
    create: vi.fn(async () => ({ code: 'ABC234', room })),
    join: vi.fn(async () => ({ code: 'ABC234', room })),
    reconnect: vi.fn(async () => ({ code: 'ABC234', room })),
  };
  const view: LobbyView = {
    setBusy: vi.fn(),
    showRoom: vi.fn(),
    showPositions: vi.fn(),
    showPatients: vi.fn(),
    showInteractionResult: vi.fn(),
    showHealingMachine: vi.fn(),
    showDischargedCount: vi.fn(),
    showPhase: vi.fn(),
    showLobbyResult: vi.fn(),
    showMenu: vi.fn(),
  };
  return { controller: new LobbyController(gateway, view, storage), gateway, view, room,
    players: (roster: PlayerPresence[]) => messages.get('lobby:players')?.(roster as never),
    resume: (lastSequence: number) => messages.get('room:resume')?.({ lastSequence } as never),
    result: (result: { ok: boolean; reason: string }) => messages.get('patient:result')?.(result as never),
    state: (positions: Map<string, { x: number; y: number; facing: 'up' | 'down' | 'left' | 'right';
      carriedPatientId: string }>, patients = new Map<string, PatientRecord>()) =>
      stateChange?.({ players: positions, patients,
        healingMachine: { patientId: 'patient-1', status: 'treating', remainingMs: 3000 },
        dischargedCount: 1, phase: 'running', hostId: 'host-id',
        countdownRemainingMs: 0, roundId: 'round-1' }),
    disconnect: () => disconnected?.(), drop: () => dropped?.(),
    reconnect: () => reconnected?.() };
}

describe('LobbyController', () => {
  it('stores the reconnect token and sequence, pauses on drop, and restores a reloaded session', async () => {
    const saved = new Map<string, string>();
    const storage = { getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => { saved.set(key, value); },
      removeItem: (key: string) => { saved.delete(key); } } as Storage;
    const { controller, gateway, view, room, drop, reconnect, resume } = setup(storage);
    await controller.create('Red');
    controller.selectCharacter('Chansey');
    expect(JSON.parse(saved.get('pokecenter:room')!)).toEqual({
      token: 'room-1:secret', code: 'ABC234', sequence: 1,
    });
    drop();
    controller.setReady(true);
    expect(room.send).not.toHaveBeenCalledWith('player:ready', expect.anything());
    expect(view.showLobbyResult).toHaveBeenCalledWith('Reconnecting to the room…');
    room.reconnectionToken = 'room-1:new-secret';
    reconnect();
    expect(JSON.parse(saved.get('pokecenter:room')!).token).toBe('room-1:new-secret');
    const restored = new LobbyController(gateway, view, storage);
    await restored.restore();
    expect(gateway.reconnect).toHaveBeenCalledWith('room-1:new-secret', 'ABC234');
    resume(9);
    restored.setReady(true);
    expect(room.send).toHaveBeenCalledWith('player:ready', {
      ready: true, sequence: 10, roundId: null,
    });
    await restored.leave();
    expect(saved.has('pokecenter:room')).toBe(false);
  });
  it('creates a room, shows its code, and updates the connected player list', async () => {
    const { controller, gateway, view, room, players } = setup();
    await controller.create('Red');
    expect(gateway.create).toHaveBeenCalledWith('Red');
    expect(view.showRoom).toHaveBeenCalledWith('ABC234', [], 'host-id');
    expect(room.send).toHaveBeenCalledWith('lobby:sync');
    const roster = [{ id: 'host-id', name: 'Red', slot: 0 }, { id: 'guest-id', name: 'Blue', slot: 1 }];
    players(roster);
    expect(view.showRoom).toHaveBeenCalledWith('ABC234', roster, 'host-id');
    expect(view.setBusy).toHaveBeenLastCalledWith(false);
    expect(view.showPositions).toHaveBeenCalledWith([{
      id: 'host-id', x: 456, y: 422, facing: 'up', carriedPatientId: '',
    }]);
    expect(view.showPatients).toHaveBeenCalledWith([]);
  });

  it('joins by code and returns to the menu when leaving', async () => {
    const { controller, gateway, view, room, players } = setup();
    await controller.join('abc234', 'Blue');
    expect(gateway.join).toHaveBeenCalledWith('abc234', 'Blue');
    await controller.leave();
    expect(room.leave).toHaveBeenCalled();
    expect(view.showMenu).toHaveBeenCalledWith('You left the room.');
    vi.mocked(view.showRoom).mockClear();
    players([{ id: 'host-id', name: 'Red', slot: 0 }]);
    expect(view.showRoom).not.toHaveBeenCalled();
  });

  it('sends ordered direction-only input and applies server positions to the view', async () => {
    const { controller, room, view, state, result } = setup();
    await controller.create('Red');
    state(new Map([['host-id', { x: 456, y: 422, facing: 'up', carriedPatientId: '' }]]));
    controller.sendInput('right');
    controller.sendInput(null);
    expect(room.send).toHaveBeenCalledWith('player:input', { direction: 'right', sequence: 1, roundId: 'round-1' });
    expect(room.send).toHaveBeenCalledWith('player:input', { direction: null, sequence: 2, roundId: 'round-1' });
    state(new Map([['host-id', { x: 470, y: 422, facing: 'right', carriedPatientId: '' }],
      ['guest-id', { x: 504, y: 422, facing: 'left', carriedPatientId: '' }]]));
    expect(view.showPositions).toHaveBeenLastCalledWith([
      { id: 'host-id', x: 470, y: 422, facing: 'right', carriedPatientId: '' },
      { id: 'guest-id', x: 504, y: 422, facing: 'left', carriedPatientId: '' },
    ]);
    const patient: PatientRecord = {
      id: 'patient-1', species: 'Pikachu', requiredTreatments: 1, completedTreatments: 0,
      initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active',
      location: 'reception', slotIndex: 0, carrierId: '',
    };
    state(new Map([['host-id', { x: 470, y: 422, facing: 'right', carriedPatientId: '' }]]),
      new Map([[patient.id, patient]]));
    expect(view.showPatients).toHaveBeenLastCalledWith([patient]);
    expect(view.showHealingMachine).toHaveBeenCalledWith({
      patientId: 'patient-1', status: 'treating', remainingMs: 3000,
    });
    expect(view.showDischargedCount).toHaveBeenCalledWith(1);
    controller.sendInteraction({ targetId: 'reception:0', expectedOccupantId: patient.id });
    expect(room.send).toHaveBeenCalledWith('patient:interact',
      { targetId: 'reception:0', expectedOccupantId: patient.id });
    result({ ok: false, reason: 'Patient already claimed or removed' });
    expect(view.showInteractionResult).toHaveBeenCalledWith({ ok: false, reason: 'Patient already claimed or removed' });
    await controller.leave();
    vi.mocked(room.send).mockClear();
    controller.sendInput('left');
    expect(room.send).not.toHaveBeenCalled();
  });

  it('sends character, ready, and start commands while waiting in the lobby', async () => {
    const { controller, room, view } = setup();
    await controller.create('Red');
    controller.sendInput('right');
    controller.sendInteraction({ targetId: 'reception:0', expectedOccupantId: 'patient-1' });
    controller.selectCharacter('Chansey');
    controller.setReady(true);
    controller.startGame();
    expect(room.send).not.toHaveBeenCalledWith('player:input', expect.anything());
    expect(room.send).toHaveBeenCalledWith('player:select',
      { character: 'Chansey', sequence: 1, roundId: null });
    expect(room.send).toHaveBeenCalledWith('player:ready',
      { ready: true, sequence: 2, roundId: null });
    expect(room.send).toHaveBeenCalledWith('game:start', { sequence: 3, roundId: null });
    expect(view.showPhase).toHaveBeenCalledWith({ phase: 'lobby', hostId: 'host-id',
      countdownRemainingMs: 0, roundId: '' }, 'host-id');
  });

  it('shows a server error and clears a disconnected room', async () => {
    const { controller, gateway, view, disconnect } = setup();
    vi.mocked(gateway.join).mockRejectedValueOnce(new Error('Invalid room code'));
    await controller.join('bad', 'Blue');
    expect(view.showMenu).toHaveBeenCalledWith('Invalid room code');
    await controller.create('Red');
    disconnect();
    expect(view.showMenu).toHaveBeenCalledWith('Connection to the room was lost.');
  });
});
