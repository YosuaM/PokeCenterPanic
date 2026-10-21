import type { AddressInfo } from 'node:net';
import { Client } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROJECT_INFO } from '@pokecenter/shared';
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

    const hostRoster = new Promise<string[]>((resolve) => host.onMessage('lobby:players', resolve));
    host.send('lobby:sync');
    expect(await hostRoster).toEqual(['Red']);

    const joined = await reserve(`/api/rooms/${created.body.code.toLowerCase()}/join`, 'Blue');
    expect(joined.status).toBe(200);
    const guest = await new Client(endpoint).consumeSeatReservation(joined.body.reservation);
    joinedRooms.push(guest);
    expect(guest.roomId).toBe(host.roomId);

    const guestRoster = new Promise<string[]>((resolve) => guest.onMessage('lobby:players', resolve));
    guest.send('lobby:sync');
    expect(await guestRoster).toEqual(['Red', 'Blue']);

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

});

describe('capacity configuration', () => {
  it.each([0, 5, 1.5])('rejects invalid capacity %s', (capacity) => {
    expect(() => createGameServer({ capacity })).toThrow('Room capacity must be an integer between 1 and 4');
  });
});
