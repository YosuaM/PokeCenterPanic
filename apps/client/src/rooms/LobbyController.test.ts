import type { Room } from '@colyseus/sdk';
import type { MedicineDiscardEvent, PatientRecord, PlayerPresence } from '@pokecenter/shared';
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
    showMedicines: vi.fn(),
    showMedicineDiscard: vi.fn(),
    showInteractionResult: vi.fn(),
    showHealingMachine: vi.fn(),
    showDischargedCount: vi.fn(),
    showLostCount: vi.fn(),
    showPhase: vi.fn(),
    showRound: vi.fn(),
    showLobbyResult: vi.fn(),
    showMenu: vi.fn(),
  };
  return { controller: new LobbyController(gateway, view, storage), gateway, view, room,
    discarded: (event: MedicineDiscardEvent) => messages.get('medicine:discarded')?.(event as never),
    players: (roster: PlayerPresence[]) => messages.get('lobby:players')?.(roster as never),
    resume: (lastSequence: number) => messages.get('room:resume')?.({ lastSequence } as never),
    result: (result: { ok: boolean; reason: string }) => messages.get('patient:result')?.(result as never),
    medicineResult: (result: { ok: boolean; reason: string }) =>
      messages.get('medicine:result')?.(result as never),
    snapshot: (snapshot: object) => stateChange?.({ ...room.state, ...snapshot }),
    state: (positions: Map<string, { x: number; y: number; facing: 'up' | 'down' | 'left' | 'right';
      carriedPatientId: string }>, patients = new Map<string, PatientRecord>()) =>
      stateChange?.({ players: positions, patients,
        healingMachine: { patientId: 'patient-1', status: 'treating', remainingMs: 3000 },
        dischargedCount: 1, lostCount: 2, phase: 'running', hostId: 'host-id',
        countdownRemainingMs: 0, roundId: 'round-1' }),
    disconnect: () => disconnected?.(), drop: () => dropped?.(),
    reconnect: () => reconnected?.() };
}

describe('LobbyController', () => {
  it('forwards independent machine occupancy and repair progress from the server', async () => {
    const { controller, snapshot, view } = setup();
    await controller.create('Red');
    const first = { patientId: 'p1', status: 'treating', remainingMs: 3000,
      repairOwnerId: '', repairRemainingMs: 0 };
    const second = { patientId: 'p2', status: 'broken', remainingMs: 2500,
      repairOwnerId: 'host-id', repairRemainingMs: 700 };
    snapshot({ healingMachine: first, secondHealingMachine: second });
    expect(view.showHealingMachine).toHaveBeenLastCalledWith(first, second);
  });

  it('shows authoritative results after reconnect and sends host replay only for the current round', async () => {
    const { controller, view, room, snapshot, drop, reconnect } = setup();
    await controller.create('Red');
    controller.replay();
    expect(room.send).not.toHaveBeenCalledWith('game:replay', expect.anything());
    const results = { score: 355, admitted: 5, discharged: 3, lost: 1, unfinished: 1, stars: 1, bestStreak: 3 };
    snapshot({ phase: 'running', roundId: 'round-1', roundRemainingMs: 1, score: 355, streak: 3 });
    expect(view.showRound).toHaveBeenLastCalledWith({ remainingMs: 1, score: 355, streak: 3, results: null });
    snapshot({ phase: 'results', roundId: 'round-1', roundRemainingMs: 0, score: 355, streak: 3, results });
    expect(view.showRound).toHaveBeenLastCalledWith({ remainingMs: 0, score: 355, streak: 3, results });
    vi.mocked(room.send).mockClear();
    controller.sendInput('up');
    controller.sendInteraction({ targetId: 'discharge', expectedOccupantId: 'patient-1' });
    drop();
    controller.replay();
    expect(room.send).not.toHaveBeenCalled();
    reconnect();
    controller.replay();
    expect(room.send).toHaveBeenCalledWith('game:replay', { sequence: 1, roundId: 'round-1' });
    snapshot({ phase: 'results', hostId: 'other', roundId: 'round-1' });
    vi.mocked(room.send).mockClear();
    controller.replay();
    expect(room.send).not.toHaveBeenCalled();
    snapshot({ phase: 'lobby', roundId: '', roundRemainingMs: 360000, score: 0 });
    expect(view.showRound).toHaveBeenLastCalledWith({ remainingMs: 360000, score: 0, streak: 0, results: null });
  });

  it('shows confirmed discards once and ignores old rounds, reconnection and departed rooms', async () => {
    const test = setup();
    await test.controller.create('Staff');
    const event = { roundId: 'round-1', doseId: 'dose-1', kind: 'burnHeal' as const };
    test.discarded(event);
    expect(test.view.showMedicineDiscard).not.toHaveBeenCalled();
    test.state(new Map());
    test.discarded({ ...event, roundId: 'old-round' });
    test.discarded(event);
    test.discarded(event);
    expect(test.view.showMedicineDiscard).toHaveBeenCalledExactlyOnceWith(event);
    test.drop();
    test.discarded({ ...event, doseId: 'dose-2' });
    expect(test.view.showMedicineDiscard).toHaveBeenCalledOnce();
    test.reconnect();
    test.discarded({ ...event, doseId: 'dose-2', kind: 'antidote' });
    expect(test.view.showMedicineDiscard).toHaveBeenCalledTimes(2);
    await test.controller.leave();
    test.discarded({ ...event, doseId: 'dose-3' });
    expect(test.view.showMedicineDiscard).toHaveBeenCalledTimes(2);
  });

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
      id: 'host-id', x: 456, y: 422, facing: 'up', carriedPatientId: '', carriedMedicineId: '',
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
    expect(room.send).toHaveBeenCalledWith('player:input', { direction: 'right', interactHeld: false,
      sequence: 1, roundId: 'round-1' });
    expect(room.send).toHaveBeenCalledWith('player:input', { direction: null, interactHeld: false,
      sequence: 2, roundId: 'round-1' });
    state(new Map([['host-id', { x: 470, y: 422, facing: 'right', carriedPatientId: '' }],
      ['guest-id', { x: 504, y: 422, facing: 'left', carriedPatientId: '' }]]));
    expect(view.showPositions).toHaveBeenLastCalledWith([
      { id: 'host-id', x: 470, y: 422, facing: 'right', carriedPatientId: '', carriedMedicineId: '' },
      { id: 'guest-id', x: 504, y: 422, facing: 'left', carriedPatientId: '', carriedMedicineId: '' },
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
    expect(view.showLostCount).toHaveBeenCalledWith(2);
    controller.sendInteraction({ targetId: 'reception:0', expectedOccupantId: patient.id });
    expect(room.send).toHaveBeenCalledWith('patient:interact',
      { targetId: 'reception:0', expectedOccupantId: patient.id, sequence: 3, roundId: 'round-1' });
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
    controller.selectCharacter(null);
    expect(room.send).toHaveBeenLastCalledWith('player:select',
      { character: null, sequence: 4, roundId: null });
    expect(view.showPhase).toHaveBeenCalledWith({ phase: 'lobby', hostId: 'host-id',
      countdownRemainingMs: 0, roundId: '' }, 'host-id');
  });

  it('sends sequenced medicine interactions and held input, then shows server feedback', async () => {
    const { controller, room, state, view, medicineResult } = setup();
    await controller.create('Red');
    state(new Map([['host-id', { x: 400, y: 350, facing: 'up', carriedPatientId: '' }]]));
    controller.sendInteraction({ targetId: 'medicine:prep:0', expectedOccupantId: '' });
    controller.sendInput(null, true);
    controller.sendInput(null, false);
    expect(room.send).toHaveBeenCalledWith('medicine:interact', {
      targetId: 'medicine:prep:0', expectedOccupantId: '', sequence: 1, roundId: 'round-1',
    });
    expect(room.send).toHaveBeenCalledWith('player:input', {
      direction: null, interactHeld: true, sequence: 2, roundId: 'round-1',
    });
    expect(room.send).toHaveBeenCalledWith('player:input', {
      direction: null, interactHeld: false, sequence: 3, roundId: 'round-1',
    });
    medicineResult({ ok: false, reason: 'Preparation point occupied' });
    expect(view.showInteractionResult).toHaveBeenCalledWith({ ok: false,
      reason: 'Preparation point occupied' });
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
