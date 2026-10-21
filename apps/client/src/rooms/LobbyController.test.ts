import type { Room } from '@colyseus/sdk';
import type { PatientRecord, PlayerPresence } from '@pokecenter/shared';
import { describe, expect, it, vi } from 'vitest';
import { LobbyController, type LobbyGateway, type LobbyView } from './LobbyController.js';

function setup() {
  let message: ((players: PlayerPresence[]) => void) | undefined;
  let stateChange: ((state: unknown) => void) | undefined;
  let disconnected: (() => void) | undefined;
  const room = {
    sessionId: 'host-id',
    state: { players: new Map([['host-id', { x: 456, y: 422 }]]) },
    leave: vi.fn(async () => 1000),
    send: vi.fn(),
    onMessage: vi.fn((_type, listener) => { message = listener; }),
    onStateChange: vi.fn((listener) => { stateChange = listener; }),
    onLeave: vi.fn((listener) => { disconnected = listener; }),
  } as unknown as Room;
  const gateway: LobbyGateway = {
    create: vi.fn(async () => ({ code: 'ABC234', room })),
    join: vi.fn(async () => ({ code: 'ABC234', room })),
  };
  const view: LobbyView = {
    setBusy: vi.fn(),
    showRoom: vi.fn(),
    showPositions: vi.fn(),
    showPatients: vi.fn(),
    showMenu: vi.fn(),
  };
  return { controller: new LobbyController(gateway, view), gateway, view, room,
    players: (roster: PlayerPresence[]) => message?.(roster),
    state: (positions: Map<string, { x: number; y: number }>, patients = new Map<string, PatientRecord>()) =>
      stateChange?.({ players: positions, patients }),
    disconnect: () => disconnected?.() };
}

describe('LobbyController', () => {
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
    expect(view.showPositions).toHaveBeenCalledWith([{ id: 'host-id', x: 456, y: 422 }]);
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
    const { controller, room, view, state } = setup();
    await controller.create('Red');
    controller.sendInput('right');
    controller.sendInput(null);
    expect(room.send).toHaveBeenCalledWith('player:input', { direction: 'right', sequence: 1, roundId: null });
    expect(room.send).toHaveBeenCalledWith('player:input', { direction: null, sequence: 2, roundId: null });
    state(new Map([['host-id', { x: 470, y: 422 }], ['guest-id', { x: 504, y: 422 }]]));
    expect(view.showPositions).toHaveBeenLastCalledWith([
      { id: 'host-id', x: 470, y: 422 }, { id: 'guest-id', x: 504, y: 422 },
    ]);
    const patient: PatientRecord = {
      id: 'patient-1', species: 'Pikachu', requiredTreatments: 1, completedTreatments: 0,
      initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active',
      location: 'reception', slotIndex: 0, carrierId: '',
    };
    state(new Map([['host-id', { x: 470, y: 422 }]]), new Map([[patient.id, patient]]));
    expect(view.showPatients).toHaveBeenLastCalledWith([patient]);
    await controller.leave();
    vi.mocked(room.send).mockClear();
    controller.sendInput('left');
    expect(room.send).not.toHaveBeenCalled();
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
