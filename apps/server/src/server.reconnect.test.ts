import type { AddressInfo } from 'node:net';
import { Client } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createGameServer } from './server.js';

describe('room reconnection', () => {
  const server = createGameServer({ capacity: 2, countdownMs: 50,
    reconnectMs: 600, emptyRoomMs: 1_500 });
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
    await Promise.all(joinedRooms.map((room) => room.leave().catch(() => 1000)));
    await server.gracefullyShutdown(false);
  });

  async function reserve(path: string, name: string) {
    const response = await fetch(`${endpoint}${path}`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
    return { status: response.status, body: await response.json() };
  }

  it('restores only the token holder without reclaiming host or ready status', async () => {
    const created = await reserve('/api/rooms', 'Red');
    const host = await new Client(endpoint).consumeSeatReservation(created.body.reservation);
    const joined = await reserve(`/api/rooms/${created.body.code}/join`, 'Blue');
    const guest = await new Client(endpoint).consumeSeatReservation(joined.body.reservation);
    joinedRooms.push(guest);
    host.send('player:select', { character: 'Chansey', sequence: 1, roundId: null });
    host.send('player:ready', { ready: true, sequence: 2, roundId: null });
    await vi.waitFor(() => expect((guest.state as { players: Map<string, { ready: boolean }> })
      .players.get(host.sessionId)?.ready).toBe(true), { timeout: 2000 });
    const token = host.reconnectionToken;
    host.reconnection.enabled = false;
    await host.leave(false);
    const state = () => guest.state as { hostId: string; players: Map<string,
      { name: string; slot: number; character: string; ready: boolean; connected: boolean;
        x: number; y: number; carriedPatientId: string }> };
    await vi.waitFor(() => expect(state().players.get(host.sessionId)?.connected)
      .toBe(false), { timeout: 2000 });
    expect(state().hostId).toBe(guest.sessionId);
    expect(await reserve(`/api/rooms/${created.body.code}/join`, 'Green')).toEqual({
      status: 409, body: { error: 'Room is full' },
    });
    await expect(new Client(endpoint).reconnect(`${host.roomId}:invalid`)).rejects.toThrow();
    const resumed = await new Client(endpoint).reconnect(token);
    joinedRooms.push(resumed);
    expect(resumed.sessionId).toBe(host.sessionId);
    await vi.waitFor(() => expect(state().players.get(host.sessionId)?.connected)
      .toBe(true), { timeout: 2000 });
    expect(state().players.get(host.sessionId)).toEqual(expect.objectContaining({
      name: 'Red', slot: 0, character: 'Chansey', ready: false,
      x: 456, y: 190, carriedPatientId: '',
    }));
    expect(state().hostId).toBe(guest.sessionId);
  });

  it('gives the first returning member authority when nobody remains connected', async () => {
    const created = await reserve('/api/rooms', 'Red');
    const host = await new Client(endpoint).consumeSeatReservation(created.body.reservation);
    const token = host.reconnectionToken;
    host.reconnection.enabled = false;
    await host.leave(false);
    const resumed = await new Client(endpoint).reconnect(token);
    joinedRooms.push(resumed);
    await vi.waitFor(() => expect((resumed.state as { hostId: string }).hostId)
      .toBe(host.sessionId), { timeout: 2000 });
  });

  it('releases an explicitly vacated seat immediately', async () => {
    const created = await reserve('/api/rooms', 'Red');
    const host = await new Client(endpoint).consumeSeatReservation(created.body.reservation);
    joinedRooms.push(host);
    const joined = await reserve(`/api/rooms/${created.body.code}/join`, 'Blue');
    const guest = await new Client(endpoint).consumeSeatReservation(joined.body.reservation);
    await guest.leave();
    const replacement = await reserve(`/api/rooms/${created.body.code}/join`, 'Green');
    expect(replacement.status).toBe(200);
    const member = await new Client(endpoint).consumeSeatReservation(replacement.body.reservation);
    joinedRooms.push(member);
  });

  it('resets abandoned gameplay before admitting a new member', async () => {
    const created = await reserve('/api/rooms', 'Red');
    const host = await new Client(endpoint).consumeSeatReservation(created.body.reservation);
    host.send('player:select', { character: 'Chansey', sequence: 1, roundId: null });
    host.send('player:ready', { ready: true, sequence: 2, roundId: null });
    await vi.waitFor(() => expect((host.state as { players: Map<string, { ready: boolean }> })
      .players.get(host.sessionId)?.ready).toBe(true), { timeout: 2000 });
    host.send('game:start', { sequence: 3, roundId: null });
    await vi.waitFor(() => expect((host.state as { phase: string }).phase)
      .toBe('running'), { timeout: 2000 });
    host.reconnection.enabled = false;
    await host.leave(false);
    expect(await reserve(`/api/rooms/${created.body.code}/join`, 'Early')).toEqual({
      status: 409, body: { error: 'Game in progress' },
    });
    await new Promise((resolve) => setTimeout(resolve, 750));
    const replacement = await reserve(`/api/rooms/${created.body.code}/join`, 'Green');
    expect(replacement.status).toBe(200);
    const member = await new Client(endpoint).consumeSeatReservation(replacement.body.reservation);
    joinedRooms.push(member);
    const state = member.state as { phase: string; roundId: string; patients: Map<string, unknown> };
    await vi.waitFor(() => expect(state.phase).toBe('lobby'), { timeout: 2000 });
    expect(state.phase).toBe('lobby');
    expect(state.roundId).toBe('');
    expect(state.patients.size).toBe(0);
  });

  it('expires credentials and releases the seat before empty-room disposal', async () => {
    const created = await reserve('/api/rooms', 'Red');
    const host = await new Client(endpoint).consumeSeatReservation(created.body.reservation);
    const token = host.reconnectionToken;
    host.reconnection.enabled = false;
    await host.leave(false);
    await new Promise((resolve) => setTimeout(resolve, 750));
    await expect(new Client(endpoint).reconnect(token)).rejects.toThrow();
    const replacement = await reserve(`/api/rooms/${created.body.code}/join`, 'Green');
    expect(replacement.status).toBe(200);
    const member = await new Client(endpoint).consumeSeatReservation(replacement.body.reservation);
    expect(member.sessionId).not.toBe(host.sessionId);
    await member.leave();
    await new Promise((resolve) => setTimeout(resolve, 1_650));
    expect(await reserve(`/api/rooms/${created.body.code}/join`, 'Late')).toEqual({
      status: 404, body: { error: 'Invalid room code' },
    });
  }, 8_000);
});
