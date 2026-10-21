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
  it('defaults to two seats and accepts up to four', () => {
    expect(resolveCapacity(undefined)).toBe(2);
    expect(resolveCapacity('3')).toBe(3);
    expect(resolveCapacity('4')).toBe(4);
  });

  it.each(['0', '5', '1.5', '02', ' 2 ', 'invalid'])('rejects invalid ROOM_CAPACITY=%s', (value) => {
    expect(() => resolveCapacity(value)).toThrow('ROOM_CAPACITY must be an integer between 1 and 4');
  });
});

describe('private room flow', () => {
  const server = createGameServer({ capacity: 3 });
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
    expect(await hostRoster).toEqual([{ id: host.sessionId, name: 'Red', slot: 0 }]);

    const joined = await reserve(`/api/rooms/${created.body.code.toLowerCase()}/join`, 'Blue');
    expect(joined.status).toBe(200);
    const guest = await new Client(endpoint).consumeSeatReservation(joined.body.reservation);
    joinedRooms.push(guest);
    expect(guest.roomId).toBe(host.roomId);

    const guestRoster = new Promise<PlayerPresence[]>((resolve) => guest.onMessage('lobby:players', resolve));
    guest.send('lobby:sync');
    expect(await guestRoster).toEqual([
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
    expect(await updatedRoster).toEqual([{ id: host.sessionId, name: 'Red', slot: 0 }]);
  });

  it('replicates server-validated positions to both clients', async () => {
    const created = await reserve('/api/rooms', 'Red');
    const host = await new Client(endpoint).consumeSeatReservation(created.body.reservation);
    joinedRooms.push(host);
    const joined = await reserve(`/api/rooms/${created.body.code}/join`, 'Blue');
    const guest = await new Client(endpoint).consumeSeatReservation(joined.body.reservation);
    joinedRooms.push(guest);

    const player = (room: typeof host) => {
      const state = room.state as { players: Map<string, { x: number; y: number }> };
      return state.players?.get(host.sessionId);
    };
    await vi.waitFor(() => expect(player(host)).toBeDefined(), { timeout: 2000 });
    await vi.waitFor(() => expect(player(guest)).toBeDefined(), { timeout: 2000 });
    expect(player(host)).toEqual(expect.objectContaining({ x: 456, y: 422 }));
    expect(player(guest)).toEqual(expect.objectContaining({ x: 456, y: 422 }));
    host.send('player:input', { direction: 'right', sequence: 1, roundId: null });
    await vi.waitFor(() => expect(player(guest)?.x).toBeGreaterThan(456), { timeout: 2000 });
    await vi.waitFor(() => expect(player(host)?.x).toBe(player(guest)?.x), { timeout: 2000 });

    host.send('player:input', { direction: null, sequence: 2, roundId: null });
    host.send('player:input', { direction: 'up', sequence: 2, roundId: null });
    host.send('player:input', { direction: 'up', sequence: 3, roundId: 'forged' });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const stoppedX = player(guest)!.x;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(player(guest)?.x).toBe(stoppedX);
    expect(player(host)?.x).toBe(stoppedX);

    for (let sequence = 4; sequence <= 24; sequence += 1) {
      host.send('player:input', { direction: 'up', sequence, roundId: null, y: 100 });
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

});

describe('capacity configuration', () => {
  it.each([0, 5, 1.5])('rejects invalid capacity %s', (capacity) => {
    expect(() => createGameServer({ capacity })).toThrow('Room capacity must be an integer between 1 and 4');
  });
});
