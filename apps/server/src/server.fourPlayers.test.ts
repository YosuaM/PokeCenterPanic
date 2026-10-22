import type { AddressInfo } from 'node:net';
import { PLAYER_CHARACTERS } from '@pokecenter/shared';
import { Client } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createGameServer } from './server.js';

describe('four-player rounds', () => {
  const server = createGameServer({ countdownMs: 50 });
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

  it.each([1, 2, 3, 4])('starts a room with %i ready players choosing different Pokémon', async (count) => {
    const reserve = async (path: string, name: string) => {
      const response = await fetch(`${endpoint}${path}`, { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
      return { status: response.status, body: await response.json() };
    };
    const created = await reserve('/api/rooms', 'Player 1');
    expect(created.status).toBe(200);
    const members = [await new Client(endpoint).consumeSeatReservation(created.body.reservation)];
    joinedRooms.push(members[0]!);
    for (let index = 2; index <= count; index += 1) {
      const joined = await reserve(`/api/rooms/${created.body.code}/join`, `Player ${index}`);
      expect(joined.status).toBe(200);
      const member = await new Client(endpoint).consumeSeatReservation(joined.body.reservation);
      members.push(member);
      joinedRooms.push(member);
    }
    if (count === 4) {
      expect(await reserve(`/api/rooms/${created.body.code}/join`, 'Player 5')).toEqual({
        status: 409, body: { error: 'Room is full' },
      });
    }
    for (const [index, member] of members.entries()) {
      member.send('player:select', { character: PLAYER_CHARACTERS[index], sequence: 1, roundId: null });
      member.send('player:ready', { ready: true, sequence: 2, roundId: null });
    }
    const host = members[0]!;
    const state = () => host.state as { phase: string; players: Map<string,
      { name: string; slot: number; character: string; ready: boolean }> };
    await vi.waitFor(() => expect(members.every((member) =>
      state().players?.get(member.sessionId)?.ready)).toBe(true), { timeout: 2000 });
    expect(members.map((member) => state().players.get(member.sessionId))).toEqual(
      members.map((_, index) => expect.objectContaining({ name: `Player ${index + 1}`,
        slot: index, character: PLAYER_CHARACTERS[index] })));
    host.send('game:start', { sequence: 3, roundId: null });
    await vi.waitFor(() => expect(members.every((member) =>
      (member.state as { phase: string }).phase === 'running')).toBe(true), { timeout: 2000 });
  });
});
