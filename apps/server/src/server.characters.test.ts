import type { AddressInfo } from 'node:net';
import { Client, type Room } from '@colyseus/sdk';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { PlayerPresence } from '@pokecenter/shared';
import type { RoomState } from './rooms/RoomState.js';
import { createGameServer } from './server.js';

const server = createGameServer({ countdownMs: 50 });
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

it('arbitrates simultaneous claims, broadcasts deselection, and rejects start until everyone has a unique ready Pokémon', async () => {
  async function enter(path: string, name: string) {
    const response = await fetch(`${endpoint}${path}`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
    const result = await response.json();
    const room = await new Client(endpoint).consumeSeatReservation(result.reservation);
    room.onMessage('*', () => {});
    clients.push(room);
    return { room, code: result.code };
  }
  const { room: host, code } = await enter('/api/rooms', 'Red');
  const { room: guest } = await enter(`/api/rooms/${code}/join`, 'Blue');
  const state = () => host.state as RoomState;
  const results = new Map<Room, Array<{ ok: boolean; reason: string }>>();
  const sequences = new Map<Room, number>();
  for (const room of clients) {
    results.set(room, []);
    room.onMessage('lobby:result', result => results.get(room)!.push(result));
  }
  const send = (room: Room, type: string, payload = {}) => {
    const sequence = (sequences.get(room) ?? 0) + 1;
    sequences.set(room, sequence);
    room.send(type, { ...payload, sequence, roundId: null });
  };
  send(host, 'player:select', { character: 'Meowth' });
  send(guest, 'player:select', { character: 'Meowth' });
  await vi.waitFor(() => expect([...results.values()].flat()).toHaveLength(2));
  expect([...results.values()].flat().filter(result => result.ok)).toHaveLength(1);
  expect([...results.values()].flat().find(result => !result.ok)?.reason).toContain('already chosen');
  const winner = results.get(host)![0]!.ok ? host : guest;
  const loser = winner === host ? guest : host;
  await vi.waitFor(() => expect([...state().players.values()].filter(player => player.character === 'Meowth')).toHaveLength(1));
  expect(state().players.get(loser.sessionId)?.character).toBe('');
  send(host, 'game:start');
  await vi.waitFor(() => expect(results.get(host)!.some(result => result.reason.includes('All players'))).toBe(true));
  expect(state().phase).toBe('lobby');
  send(winner, 'player:ready', { ready: true });
  await vi.waitFor(() => expect(state().players.get(winner.sessionId)?.ready).toBe(true));
  let roster: PlayerPresence[] = [];
  loser.onMessage('lobby:players', players => { roster = players; });
  send(winner, 'player:select', { character: null });
  await vi.waitFor(() => expect(roster.find(player => player.id === winner.sessionId))
    .toMatchObject({ character: undefined, ready: false }));
  send(loser, 'player:select', { character: 'Meowth' });
  send(loser, 'player:ready', { ready: true });
  send(host, 'game:start');
  await vi.waitFor(() => expect(state().players.get(loser.sessionId)?.ready).toBe(true));
  expect(state().phase).toBe('lobby');
  send(winner, 'player:select', { character: 'Chansey' });
  send(winner, 'player:ready', { ready: true });
  await vi.waitFor(() => expect([...state().players.values()].every(player => player.ready)).toBe(true));
  expect(new Set([...state().players.values()].map(player => player.character)).size).toBe(2);
  send(host, 'game:start');
  await vi.waitFor(() => expect((guest.state as RoomState).phase).toBe('running'));
});
