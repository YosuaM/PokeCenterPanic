import type { AddressInfo } from 'node:net';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker } from 'colyseus';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PLAYER_CHARACTERS, DISCHARGE_INTERACTION_POINT, TREATMENT, type RoundResults } from '@pokecenter/shared';
import { createGameServer } from './server.js';
import type { RoomState } from './rooms/RoomState.js';
import type { RoomMovement } from './rooms/RoomMovement.js';
import type { RoomPatients } from './rooms/RoomPatients.js';

describe('timed rounds and replay over the network', () => {
  const server = createGameServer({ countdownMs: 50, roundDurationMs: 1000,
    reconnectMs: 4000, emptyRoomMs: 5000 });
  const clients: Room[] = [];
  let endpoint: string;

  beforeAll(async () => {
    await server.listen(0, '127.0.0.1');
    const transport = server.transport as { server: { address(): AddressInfo } };
    endpoint = `http://127.0.0.1:${transport.server.address().port}`;
  });
  afterAll(async () => {
    await Promise.all(clients.map((client) => client.leave().catch(() => 1000)));
    await server.gracefullyShutdown(false);
  });

  async function reserve(path: string, name: string) {
    const response = await fetch(`${endpoint}${path}`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
    return { status: response.status, body: await response.json() };
  }

  it.each([0, -1, NaN, Infinity])('rejects an invalid internal round duration %s', (roundDurationMs) => {
    expect(() => createGameServer({ roundDurationMs })).toThrow('Invalid round duration');
  });

  it('replicates scores and frozen results, reconnects, and starts a clean second round', async () => {
    const created = await reserve('/api/rooms', 'Red');
    const host = await new Client(endpoint).consumeSeatReservation(created.body.reservation);
    const joined = await reserve(`/api/rooms/${created.body.code}/join`, 'Blue');
    const guest = await new Client(endpoint).consumeSeatReservation(joined.body.reservation);
    clients.push(host, guest);
    const state = (room = host) => room.state as RoomState;
    for (const [index, room] of [host, guest].entries()) {
      room.send('player:select', { character: PLAYER_CHARACTERS[index], sequence: 1, roundId: null });
      room.send('player:ready', { ready: true, sequence: 2, roundId: null });
    }
    await vi.waitFor(() => expect([...state().players.values()].every((player) => player.ready)).toBe(true));
    host.send('game:start', { sequence: 3, roundId: null });
    await vi.waitFor(() => expect(state().phase).toBe('running'));
    const firstRoundId = state().roundId;
    const local = matchMaker.getLocalRoomById(host.roomId) as unknown as {
      state: RoomState; patients: RoomPatients; movement: RoomMovement;
    };
    const patient = local.patients.admit('Eevee', TREATMENT.healing, 0)!;
    local.patients.interact(host.sessionId, { targetId: 'reception:0', expectedOccupantId: patient.id },
      { x: 348, y: 334 }, 'up');
    patient.completedTreatments = TREATMENT.healing;
    Object.assign(local.movement.position(host.sessionId)!, DISCHARGE_INTERACTION_POINT);
    const command = { targetId: 'discharge', expectedOccupantId: patient.id, sequence: 4, roundId: firstRoundId };
    host.send('patient:interact', command);
    host.send('patient:interact', command);
    await vi.waitFor(() => {
      expect(state(guest).dischargedCount).toBe(1);
      expect(state(guest).score).toBeGreaterThanOrEqual(149);
    });
    const waiting = local.patients.admit('Pikachu', TREATMENT.healing, 0)!;
    waiting.remainingPatienceMs = 5000;
    await vi.waitFor(() => expect(state(guest).phase).toBe('results'), { timeout: 2000 });
    const frozen: RoundResults = state(guest).results.toJSON() as unknown as RoundResults;
    expect(frozen).toMatchObject({ admitted: 2, discharged: 1, lost: 0, unfinished: 1, stars: 1 });
    const lateResults: Array<{ ok: boolean }> = [];
    host.onMessage('patient:result', (result) => lateResults.push(result));
    host.send('patient:interact', { ...command, sequence: 5 });
    host.send('medicine:interact', { targetId: 'medicine:prep:0', expectedOccupantId: '', sequence: 6,
      roundId: firstRoundId });
    await vi.waitFor(() => expect(lateResults).toHaveLength(1));
    expect(lateResults[0]!.ok).toBe(false);
    expect(state().results.toJSON()).toEqual(frozen);
    expect((await reserve(`/api/rooms/${created.body.code}/join`, 'New')).status).toBe(409);
    const rejected: Array<{ ok: boolean }> = [];
    guest.onMessage('lobby:result', (result) => rejected.push(result));
    guest.send('game:replay', { sequence: 3, roundId: firstRoundId });
    await vi.waitFor(() => expect(rejected.some((result) => !result.ok)).toBe(true));
    expect(state().phase).toBe('results');

    const token = guest.reconnectionToken;
    guest.reconnection.enabled = false;
    clients.splice(clients.indexOf(guest), 1);
    await guest.leave(false);
    const resumed = await new Client(endpoint).reconnect(token);
    clients.push(resumed);
    await vi.waitFor(() => expect(state(resumed).phase).toBe('results'));
    expect(state(resumed).results.toJSON()).toEqual(frozen);
    host.send('game:replay', { sequence: 7, roundId: firstRoundId });
    await vi.waitFor(() => expect(state(resumed).phase).toBe('lobby'));
    expect(state().patients.size).toBe(0);
    expect(state().medicineDoses.size).toBe(0);
    expect(state()).toMatchObject({ score: 0, admittedCount: 0, dischargedCount: 0, lostCount: 0,
      roundRemainingMs: 1000, roundId: '' });
    expect([...state().players.values()].map((player) => [player.character, player.ready]))
      .toEqual([['Chansey', false], ['Audino', false]]);
    expect(state().players.get(host.sessionId)).toMatchObject({ x: 456, y: 190, carriedPatientId: '' });
    host.send('player:ready', { sequence: 8, roundId: null, ready: true });
    resumed.send('player:ready', { sequence: 4, roundId: null, ready: true });
    await vi.waitFor(() => expect([...state().players.values()].every((player) => player.ready)).toBe(true));
    host.send('game:start', { sequence: 9, roundId: null });
    await vi.waitFor(() => expect(state(resumed).phase).toBe('running'));
    expect(state().roundId).not.toBe(firstRoundId);
    const second = local.patients.admit('Eevee', TREATMENT.healing, 0)!;
    expect(second.id).toBe(patient.id);
    Object.assign(local.movement.position(host.sessionId)!, { x: 348, y: 334 });
    const stale = { targetId: 'reception:0', expectedOccupantId: second.id, sequence: 10, roundId: firstRoundId };
    const count = lateResults.length;
    host.send('patient:interact', stale);
    host.send('player:input', { direction: 'right', sequence: 10, roundId: firstRoundId });
    await vi.waitFor(() => expect(lateResults).toHaveLength(count + 1));
    expect(state().players.get(host.sessionId)!.carriedPatientId).toBe('');
    host.send('patient:interact', { ...stale, roundId: state().roundId });
    await vi.waitFor(() => expect(state(resumed).players.get(host.sessionId)!.carriedPatientId).toBe(second.id));
    expect(state().admittedCount).toBe(1);
  });

  it('finishes with no connected members and restores the frozen empty results', async () => {
    const created = await reserve('/api/rooms', 'Solo');
    const host = await new Client(endpoint).consumeSeatReservation(created.body.reservation);
    host.send('player:select', { character: 'Audino', sequence: 1, roundId: null });
    host.send('player:ready', { ready: true, sequence: 2, roundId: null });
    await vi.waitFor(() => expect((host.state as RoomState).players.get(host.sessionId)?.ready).toBe(true));
    host.send('game:start', { sequence: 3, roundId: null });
    await vi.waitFor(() => expect((host.state as RoomState).phase).toBe('running'));
    const token = host.reconnectionToken;
    host.reconnection.enabled = false;
    await host.leave(false);
    const local = matchMaker.getLocalRoomById(host.roomId) as unknown as { state: RoomState };
    await vi.waitFor(() => expect(local.state.phase).toBe('results'), { timeout: 2000 });
    const resumed = await new Client(endpoint).reconnect(token);
    clients.push(resumed);
    await vi.waitFor(() => expect((resumed.state as RoomState).phase).toBe('results'));
    expect((resumed.state as RoomState).results).toMatchObject({ score: 0, admitted: 0, stars: 0 });
  });
});
