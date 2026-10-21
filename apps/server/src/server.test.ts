import type { AddressInfo } from 'node:net';
import { Client } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PROJECT_INFO, type PlayerPresence } from '@pokecenter/shared';
import { createGameServer, resolveCapacity, resolvePort } from './server.js';

describe('resolvePort', () => {
  it('uses the default when PORT is absent', () => {
    expect(resolvePort(undefined)).toBe(2567);
  });

  it('accepts an available numeric port', () => {
    expect(resolvePort('4000')).toBe(4000);
  });

  it.each(['', '0', '-1', '65536', '1.5', '0x100', ' 4000 ', 'invalid'])('rejects invalid PORT=%s', (value) => {
    expect(() => resolvePort(value)).toThrow('PORT must be an integer between 1 and 65535');
  });
});

describe('resolveCapacity', () => {
  it('defaults to four seats and accepts smaller rooms', () => {
    expect(resolveCapacity(undefined)).toBe(4);
    expect(resolveCapacity('1')).toBe(1);
    expect(resolveCapacity('3')).toBe(3);
    expect(resolveCapacity('4')).toBe(4);
  });

  it.each(['0', '5', '1.5', '02', ' 2 ', 'invalid'])('rejects invalid ROOM_CAPACITY=%s', (value) => {
    expect(() => resolveCapacity(value)).toThrow('ROOM_CAPACITY must be an integer between 1 and 4');
  });
});

describe('private room flow', () => {
  const server = createGameServer({ capacity: 3, countdownMs: 50 });
  let endpoint: string;
  const joinedRooms: Array<{ leave(): Promise<number> }> = [];

  beforeAll(async () => {
    await server.listen(0, '127.0.0.1');
    const transport = server.transport as { server: { address(): AddressInfo | string | null } };
    const address = transport.server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP address');
    endpoint = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await Promise.all(joinedRooms.map((room) => room.leave()));
    await server.gracefullyShutdown(false);
  });

  async function reserve(path: string, name: string) {
    const response = await fetch(`${endpoint}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    return { status: response.status, body: await response.json() };
  }

  async function startRound(host: Awaited<ReturnType<Client['consumeSeatReservation']>>,
    members: Array<Awaited<ReturnType<Client['consumeSeatReservation']>>> = []): Promise<string> {
    for (const room of [host, ...members]) {
      room.send('player:select', { character: 'Chansey', sequence: 1, roundId: null });
      room.send('player:ready', { ready: true, sequence: 2, roundId: null });
    }
    await vi.waitFor(() => {
      const state = host.state as { players: Map<string, { ready: boolean }> };
      expect([host, ...members].every((room) => state.players?.get(room.sessionId)?.ready)).toBe(true);
    }, { timeout: 2000 });
    host.send('game:start', { sequence: 3, roundId: null });
    await vi.waitFor(() => expect((host.state as { phase: string }).phase).toBe('running'),
      { timeout: 2000 });
    return (host.state as { roundId: string }).roundId;
  }

  it('creates a private room and joins it from another client with a case-insensitive code', async () => {
    const created = await reserve('/api/rooms', 'Red');
    expect(created.status).toBe(200);
    expect(created.body.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    const host = await new Client(endpoint).consumeSeatReservation(created.body.reservation);
    joinedRooms.push(host);
    expect(host.name).toBe(PROJECT_INFO.roomName);

    await expect(new Client(endpoint).joinById(host.roomId, { name: 'Intruder' }))
      .rejects.toThrow('Invalid room code');
    await expect(new Client(endpoint).joinById(host.roomId)).rejects.toThrow();

    const hostRoster = new Promise<PlayerPresence[]>((resolve) => host.onMessage('lobby:players', resolve));
    host.send('lobby:sync');
    expect((await hostRoster).map(({ id, name, slot }) => ({ id, name, slot })))
      .toEqual([{ id: host.sessionId, name: 'Red', slot: 0 }]);

    const joined = await reserve(`/api/rooms/${created.body.code.toLowerCase()}/join`, 'Blue');
    expect(joined.status).toBe(200);
    const guest = await new Client(endpoint).consumeSeatReservation(joined.body.reservation);
    joinedRooms.push(guest);
    expect(guest.roomId).toBe(host.roomId);

    const guestRoster = new Promise<PlayerPresence[]>((resolve) => guest.onMessage('lobby:players', resolve));
    guest.send('lobby:sync');
    expect((await guestRoster).map(({ id, name, slot }) => ({ id, name, slot }))).toEqual([
      { id: host.sessionId, name: 'Red', slot: 0 },
      { id: guest.sessionId, name: 'Blue', slot: 1 },
    ]);

    const third = await reserve(`/api/rooms/${created.body.code}/join`, 'Green');
    expect(third.status).toBe(200);
    const teammate = await new Client(endpoint).consumeSeatReservation(third.body.reservation);
    joinedRooms.push(teammate);
    expect(teammate.roomId).toBe(host.roomId);

    const full = await reserve(`/api/rooms/${created.body.code}/join`, 'Yellow');
    expect(full).toEqual({ status: 409, body: { error: 'Room is full' } });
  });

  it('rejects invalid codes, invalid names, and direct room creation', async () => {
    expect(await reserve('/api/rooms/ABC123/join', 'Blue')).toEqual({
      status: 404,
      body: { error: 'Invalid room code' },
    });
    expect(await reserve('/api/rooms', '  ')).toEqual({
      status: 400,
      body: { error: 'Enter a name of 1–16 visible characters' },
    });
    await expect(new Client(endpoint).create(PROJECT_INFO.roomName, { name: 'Red' })).rejects.toThrow();
  });

  it('removes a departed player from the roster', async () => {
    const created = await reserve('/api/rooms', 'Red');
    const host = await new Client(endpoint).consumeSeatReservation(created.body.reservation);
    joinedRooms.push(host);
    const joinedRoster = new Promise<PlayerPresence[]>((resolve) => {
      host.onMessage('lobby:players', (roster: PlayerPresence[]) => {
        if (roster.length === 2) resolve(roster);
      });
    });
    const joined = await reserve(`/api/rooms/${created.body.code}/join`, 'Blue');
    const guest = await new Client(endpoint).consumeSeatReservation(joined.body.reservation);
    guest.onMessage('lobby:players', () => undefined);
    await joinedRoster;
    const updatedRoster = new Promise<PlayerPresence[]>((resolve) => {
      host.onMessage('lobby:players', (roster: PlayerPresence[]) => {
        if (roster.length === 1) resolve(roster);
      });
    });
    await guest.leave();
    expect((await updatedRoster).map(({ id, name, slot }) => ({ id, name, slot })))
      .toEqual([{ id: host.sessionId, name: 'Red', slot: 0 }]);
  });

  it('transfers host start authority to the earliest remaining member', async () => {
    const created = await reserve('/api/rooms', 'Red');
    const host = await new Client(endpoint).consumeSeatReservation(created.body.reservation);
    const guests: Array<Awaited<ReturnType<Client['consumeSeatReservation']>>> = [];
    for (const name of ['Blue', 'Green']) {
      const joined = await reserve(`/api/rooms/${created.body.code}/join`, name);
      const guest = await new Client(endpoint).consumeSeatReservation(joined.body.reservation);
      joinedRooms.push(guest);
      guests.push(guest);
    }
    const blue = guests[0]!;
    const green = guests[1]!;
    await host.leave();
    await vi.waitFor(() => expect((blue.state as { hostId: string }).hostId)
      .toBe(blue.sessionId), { timeout: 2000 });
    expect((green.state as { hostId: string }).hostId).toBe(blue.sessionId);
    for (const guest of guests) {
      guest.send('player:select', { character: 'Chansey', sequence: 1, roundId: null });
      guest.send('player:ready', { ready: true, sequence: 2, roundId: null });
    }
    await vi.waitFor(() => expect(guests.every((guest) =>
      (blue.state as { players: Map<string, { ready: boolean }> }).players.get(guest.sessionId)?.ready))
      .toBe(true), { timeout: 2000 });
    const rejected = new Promise<{ ok: boolean; reason: string }>((resolve) =>
      green.onMessage('lobby:result', (result: { ok: boolean; reason: string }) => {
        if (!result.ok) resolve(result);
      }));
    green.send('game:start', { sequence: 3, roundId: null });
    expect((await rejected).reason).toBe('Only the host can start');
    expect((blue.state as { phase: string }).phase).toBe('lobby');
    blue.send('game:start', { sequence: 3, roundId: null });
    await vi.waitFor(() => expect((green.state as { phase: string }).phase)
      .toBe('running'), { timeout: 2000 });
  });

  it('keeps the room in lobby until a valid host start and refuses new members during play', async () => {
    const created = await reserve('/api/rooms', 'Red');
    const host = await new Client(endpoint).consumeSeatReservation(created.body.reservation);
    joinedRooms.push(host);
    const state = () => host.state as { phase: string; roundId: string;
      players: Map<string, { x: number }>; patients: Map<string, unknown> };
    await vi.waitFor(() => expect(state().phase).toBe('lobby'), { timeout: 2000 });
    expect(state().patients.size).toBe(0);
    host.send('player:input', { direction: 'right', sequence: 1, roundId: null });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(state().players.get(host.sessionId)?.x).toBe(456);
    const rejected = new Promise<{ ok: boolean; reason: string }>((resolve) =>
      host.onMessage('lobby:result', (result: { ok: boolean; reason: string }) => {
        if (!result.ok) resolve(result);
      }));
    host.send('game:start', { sequence: 1, roundId: null });
    expect((await rejected).reason).toBe('All players must choose a character and be ready');
    host.send('player:select', { character: 'Chansey', sequence: 2, roundId: null });
    host.send('player:ready', { ready: true, sequence: 3, roundId: null });
    await vi.waitFor(() => expect(state().players.get(host.sessionId)).toEqual(
      expect.objectContaining({ ready: true })), { timeout: 2000 });
    host.send('game:start', { sequence: 4, roundId: null });
    await vi.waitFor(() => expect(state().phase).toBe('running'), { timeout: 2000 });
    expect(state().roundId).toBeTruthy();
    expect(state().patients.has('patient-1')).toBe(true);
    expect(await reserve(`/api/rooms/${created.body.code}/join`, 'Late')).toEqual({
      status: 409, body: { error: 'Game in progress' },
    });
  });

  it('replicates server-validated positions to both clients', async () => {
    const created = await reserve('/api/rooms', 'Red');
    const host = await new Client(endpoint).consumeSeatReservation(created.body.reservation);
    joinedRooms.push(host);
    const joined = await reserve(`/api/rooms/${created.body.code}/join`, 'Blue');
    const guest = await new Client(endpoint).consumeSeatReservation(joined.body.reservation);
    joinedRooms.push(guest);

    const roundId = await startRound(host, [guest]);

    const player = (room: typeof host) => {
      const state = room.state as { players: Map<string, { x: number; y: number }> };
      return state.players?.get(host.sessionId);
    };
    await vi.waitFor(() => expect(player(host)).toBeDefined(), { timeout: 2000 });
    await vi.waitFor(() => expect(player(guest)).toBeDefined(), { timeout: 2000 });
    expect(player(host)).toEqual(expect.objectContaining({ x: 456, y: 422 }));
    expect(player(guest)).toEqual(expect.objectContaining({ x: 456, y: 422 }));
    host.send('player:input', { direction: 'right', sequence: 1, roundId });
    await vi.waitFor(() => expect(player(guest)?.x).toBeGreaterThan(456), { timeout: 2000 });
    await vi.waitFor(() => expect(player(host)?.x).toBe(player(guest)?.x), { timeout: 2000 });

    host.send('player:input', { direction: null, sequence: 2, roundId });
    host.send('player:input', { direction: 'up', sequence: 2, roundId });
    host.send('player:input', { direction: 'up', sequence: 3, roundId: 'forged' });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const stoppedX = player(guest)!.x;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(player(guest)?.x).toBe(stoppedX);
    expect(player(host)?.x).toBe(stoppedX);

    for (let sequence = 4; sequence <= 24; sequence += 1) {
      host.send('player:input', { direction: 'up', sequence, roundId, y: 100 });
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await vi.waitFor(() => expect(player(guest)?.y).toBeLessThan(422), { timeout: 2000 });
    expect(player(guest)?.y).toBeGreaterThanOrEqual(322);
    await vi.waitFor(() => expect(player(host)?.y).toBe(player(guest)?.y), { timeout: 2000 });
  });

  it('replicates the same controlled reception patient to both clients', async () => {
    const created = await reserve('/api/rooms', 'Red');
    const host = await new Client(endpoint).consumeSeatReservation(created.body.reservation);
    joinedRooms.push(host);
    const joined = await reserve(`/api/rooms/${created.body.code}/join`, 'Blue');
    const guest = await new Client(endpoint).consumeSeatReservation(joined.body.reservation);
    joinedRooms.push(guest);

    await startRound(host, [guest]);

    const patientState = (room: typeof host) => room.state as {
      patients: Map<string, { id: string; species: string; location: string; slotIndex: number;
        requiredTreatments: number; completedTreatments: number }>;
      receptionSlots: string[];
      phase: string;
    };
    await vi.waitFor(() => expect(patientState(host).patients?.get('patient-1')).toBeDefined(), { timeout: 2000 });
    await vi.waitFor(() => expect(patientState(guest).patients?.get('patient-1')).toBeDefined(), { timeout: 2000 });
    for (const room of [host, guest]) {
      expect(patientState(room).phase).toBe('running');
      expect([...patientState(room).receptionSlots]).toEqual(['patient-1', '', '', '']);
      expect(patientState(room).patients.get('patient-1')).toEqual(expect.objectContaining({
        id: 'patient-1', species: 'Pikachu', location: 'reception', slotIndex: 0,
        requiredTreatments: 1, completedTreatments: 0,
      }));
    }
  });

  it('rejects a remote pickup request that is out of range without changing patient ownership', async () => {
    const created = await reserve('/api/rooms', 'Red');
    const host = await new Client(endpoint).consumeSeatReservation(created.body.reservation);
    joinedRooms.push(host);
    await startRound(host);
    await vi.waitFor(() => expect((host.state as { patients: Map<string, unknown> }).patients?.get('patient-1'))
      .toBeDefined(), { timeout: 2000 });
    const result = new Promise<{ ok: boolean; reason: string }>((resolve) =>
      host.onMessage('patient:result', resolve));
    host.send('patient:interact', { targetId: 'reception:0', expectedOccupantId: 'patient-1' });
    expect(await result).toEqual({ ok: false, reason: 'Out of range or blocked' });
    const state = host.state as {
      patients: Map<string, { location: string; carrierId: string }>;
      receptionSlots: string[];
      players: Map<string, { carriedPatientId: string }>;
    };
    expect(state.patients.get('patient-1')).toEqual(expect.objectContaining({
      location: 'reception', carrierId: '',
    }));
    expect(state.receptionSlots[0]).toBe('patient-1');
    expect(state.players.get(host.sessionId)?.carriedPatientId).toBe('');
  });

});

describe('capacity configuration', () => {
  it.each([0, 5, 1.5])('rejects invalid capacity %s', (capacity) => {
    expect(() => createGameServer({ capacity })).toThrow('Room capacity must be an integer between 1 and 4');
  });
});
