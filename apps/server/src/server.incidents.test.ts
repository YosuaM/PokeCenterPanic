import type { AddressInfo } from 'node:net';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker } from 'colyseus';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PLAYER_CHARACTERS, HEALING_INTERACTION_POINTS, HEALING_MACHINE_POSITIONS, RECEPTION_INTERACTION_POINTS,
  TREATMENT } from '@pokecenter/shared';
import { createGameServer } from './server.js';
import { MedicineDoseState, type RoomState } from './rooms/RoomState.js';
import type { RoomMovement } from './rooms/RoomMovement.js';
import type { RoomPatients } from './rooms/RoomPatients.js';
import type { RoomRound } from './rooms/RoomRound.js';

interface LocalRoom {
  state: RoomState;
  patients: RoomPatients;
  movement: RoomMovement;
  round: RoomRound;
}

describe('outages and repair over the network', () => {
  const server = createGameServer({ countdownMs: 50, reconnectMs: 4000, emptyRoomMs: 5000 });
  const clients = new Set<Room>();
  const sequences = new Map<string, number>();
  let endpoint: string;

  beforeAll(async () => {
    await server.listen(0, '127.0.0.1');
    const transport = server.transport as { server: { address(): AddressInfo } };
    endpoint = `http://127.0.0.1:${transport.server.address().port}`;
  });

  afterAll(async () => {
    await Promise.all([...clients].map((client) => client.leave().catch(() => 1000)));
    await server.gracefullyShutdown(false);
  });

  function send(room: Room, type: string, fields: object = {}) {
    const sequence = (sequences.get(room.sessionId) ?? 0) + 1;
    sequences.set(room.sessionId, sequence);
    const value = { sequence, roundId: (room.state as RoomState).roundId || null, ...fields };
    room.send(type, value);
    return value;
  }

  async function enter(path: string, name: string) {
    const response = await fetch(`${endpoint}${path}`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
    const reservation = await response.json();
    const room = await new Client(endpoint).consumeSeatReservation(reservation.reservation);
    room.onMessage('*', () => {});
    clients.add(room);
    return { room, code: reservation.code as string };
  }

  async function start() {
    const { room: red, code } = await enter('/api/rooms', 'Red');
    const { room: blue } = await enter(`/api/rooms/${code}/join`, 'Blue');
    for (const [index, room] of [red, blue].entries()) {
      send(room, 'player:select', { character: PLAYER_CHARACTERS[index], roundId: null });
      send(room, 'player:ready', { ready: true, roundId: null });
    }
    await vi.waitFor(() => expect([...(red.state as RoomState).players.values()].every((player) => player.ready)).toBe(true));
    send(red, 'game:start', { roundId: null });
    await vi.waitFor(() => expect((blue.state as RoomState).phase).toBe('running'));
    const local = matchMaker.getLocalRoomById(red.roomId) as unknown as LocalRoom;
    const now = performance.now();
    local.round.start(now - 61000);
    local.round.advance(now);
    for (const room of [red, blue]) Object.assign(local.movement.position(room.sessionId)!, HEALING_INTERACTION_POINTS[0]);
    return { red, blue, local };
  }

  function place(local: LocalRoom, carrier: Room, index: number, receptionIndex: number, treatment: number = TREATMENT.healing) {
    const patient = local.patients.admit('Eevee', treatment, receptionIndex)!;
    local.patients.interact(carrier.sessionId, { targetId: `reception:${receptionIndex}`, expectedOccupantId: patient.id },
      RECEPTION_INTERACTION_POINTS[receptionIndex]!, 'up');
    expect(local.patients.interact(carrier.sessionId, { targetId: `healing:${index}`, expectedOccupantId: '' },
      HEALING_INTERACTION_POINTS[index]!, 'down').ok).toBe(true);
    return patient;
  }

  it('replicates a natural outage, competing repairs, cancellation and disconnect, then resumes healing and medicine', async () => {
    const { red, blue, local } = await start();
    const trigger = local.patients.admit('Pikachu', TREATMENT.burnHeal, 0)!;
    trigger.remainingPatienceMs = 45000;
    const patient = place(local, red, 0, 1);
    local.state.healingMachine.remainingMs = 3000;
    const second = place(local, blue, 1, 2, TREATMENT.healing | TREATMENT.antidote);
    const state = (room = blue) => room.state as RoomState;
    await vi.waitFor(() => expect(state().healingMachine.status).toBe('broken'));
    const preserved = state().healingMachine.remainingMs;
    expect(preserved).toBeGreaterThan(2800);
    const request = { targetId: 'healing:0', expectedOccupantId: patient.id };
    const blueResults: Array<{ ok: boolean; reason: string }> = [];
    blue.onMessage('patient:result', (result) => blueResults.push(result));
    const original = send(red, 'patient:interact', request);
    red.send('patient:interact', original);
    send(blue, 'patient:interact', request);
    await vi.waitFor(() => {
      expect(state().healingMachine.repairOwnerId).toBe(red.sessionId);
      expect(blueResults.some((result) => result.reason === 'Repair in progress')).toBe(true);
    });
    send(red, 'player:input', { direction: 'right', interactHeld: true });
    send(red, 'player:input', { direction: null, interactHeld: false });
    await vi.waitFor(() => expect(state().healingMachine.repairOwnerId).toBe(''));
    expect(state().healingMachine.remainingMs).toBe(preserved);
    send(red, 'patient:interact', request);
    const heartbeat = setInterval(() => send(red, 'player:input', { direction: null, interactHeld: true }), 50);
    try {
      await vi.waitFor(() => expect(state().healingMachine.repairRemainingMs).toBeLessThan(1700));
    } finally { clearInterval(heartbeat); }
    const token = red.reconnectionToken;
    red.reconnection.enabled = false;
    clients.delete(red);
    await red.leave(false);
    await vi.waitFor(() => {
      expect(state().healingMachine.repairOwnerId).toBe('');
      expect(state().players.get(red.sessionId)!.connected).toBe(false);
    });
    expect(state().healingMachine).toMatchObject({ status: 'broken', remainingMs: preserved });
    const resumed = await new Client(endpoint).reconnect(token);
    resumed.onMessage('*', () => {});
    clients.add(resumed);
    await vi.waitFor(() => expect(state(resumed).healingMachine.status).toBe('broken'));
    expect(state(resumed).healingMachine.repairOwnerId).toBe('');
    send(blue, 'patient:interact', request);
    const completing = setInterval(() => send(blue, 'player:input', { direction: null, interactHeld: true }), 50);
    try {
      await vi.waitFor(() => expect(state(resumed).healingMachine.repairOwnerId).toBe(blue.sessionId));
      await vi.waitFor(() => expect(state(resumed).healingMachine.status).toBe('treating'), { timeout: 3000 });
    } finally { clearInterval(completing); }
    send(blue, 'player:input', { direction: null, interactHeld: false });
    expect(state(resumed).healingMachine.remainingMs).toBeLessThanOrEqual(preserved);
    expect(state(resumed).patients.get(patient.id)!.remainingPatienceMs).toBeLessThan(90000);
    await vi.waitFor(() => expect(state(resumed).healingMachine.status).toBe('completed'), { timeout: 4000 });
    expect(state().secondHealingMachine).toMatchObject({ patientId: second.id, status: 'completed' });
    expect(state().patients.get(patient.id)!.completedTreatments).toBe(TREATMENT.healing);
    expect(state().dischargedCount).toBe(0);
    expect(state().score).toBe(0);
    const dose = new MedicineDoseState();
    Object.assign(dose, { id: 'dose-test', kind: 'antidote', location: 'carrier', carrierId: blue.sessionId, slotIndex: -1 });
    local.state.medicineDoses.set(dose.id, dose);
    local.state.players.get(blue.sessionId)!.carriedMedicineId = dose.id;
    Object.assign(local.movement.position(blue.sessionId)!, HEALING_INTERACTION_POINTS[1]);
    send(blue, 'medicine:interact', { targetId: 'medicine:apply:healing:1', expectedOccupantId: second.id });
    await vi.waitFor(() => expect(state(resumed).patients.get(second.id)!.completedTreatments)
      .toBe(TREATMENT.healing | TREATMENT.antidote));
    expect(state().medicineDoses.size).toBe(0);
    expect(() => local.patients.assertOwnership()).not.toThrow();
  });

  it('loses a patient in the right broken machine once and repairs the now-empty station', async () => {
    const { red, blue, local } = await start();
    const patient = place(local, red, 1, 0);
    local.state.secondHealingMachine.status = 'broken';
    patient.remainingPatienceMs = 200;
    Object.assign(local.movement.position(blue.sessionId)!, HEALING_INTERACTION_POINTS[1]);
    send(blue, 'patient:interact', { targetId: 'healing:1', expectedOccupantId: patient.id });
    const heartbeat = setInterval(() => send(blue, 'player:input', { direction: null, interactHeld: true }), 50);
    try {
      await vi.waitFor(() => expect((red.state as RoomState).lostCount).toBe(1));
      expect((red.state as RoomState).patients.get(patient.id)).toMatchObject({ lifecycle: 'lost',
        faintX: HEALING_MACHINE_POSITIONS[1]!.x, completedTreatments: 0 });
      await vi.waitFor(() => expect((red.state as RoomState).secondHealingMachine.status).toBe('empty'), { timeout: 3000 });
    } finally { clearInterval(heartbeat); }
    expect((red.state as RoomState).secondHealingMachine).toMatchObject({ patientId: '', remainingMs: 0,
      repairOwnerId: '', repairRemainingMs: 0 });
    expect((red.state as RoomState).lostCount).toBe(1);
    expect((red.state as RoomState).score).toBe(-50);
  });
});
