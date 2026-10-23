import type { AddressInfo } from 'node:net';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker } from 'colyseus';
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

async function post(path: string, name: string) {
  const response = await fetch(`${endpoint}${path}`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
  return { status: response.status, body: await response.json() };
}

async function enter(path: string, name: string) {
  const { body } = await post(path, name);
  const room = await new Client(endpoint).consumeSeatReservation(body.reservation);
  room.onMessage('*', () => {});
  clients.push(room);
  return { room, code: body.code as string };
}

it('lets only the host fill empty seats with ready bots that start, play and leave with the people', async () => {
  const { room: host, code } = await enter('/api/rooms', 'Red');
  const { room: guest } = await enter(`/api/rooms/${code}/join`, 'Blue');
  const state = () => host.state as RoomState;
  const results = new Map<Room, Array<{ ok: boolean; reason: string }>>([[host, []], [guest, []]]);
  const sequences = new Map<Room, number>();
  let roster: PlayerPresence[] = [];
  for (const room of [host, guest]) room.onMessage('lobby:result', (result) => results.get(room)!.push(result));
  host.onMessage('lobby:players', (players) => { roster = players; });
  const send = (room: Room, type: string, payload = {}) => {
    const sequence = (sequences.get(room) ?? 0) + 1;
    sequences.set(room, sequence);
    room.send(type, { ...payload, sequence, roundId: null });
  };

  send(guest, 'lobby:addBot');
  await vi.waitFor(() => expect(results.get(guest)!.at(-1)?.reason).toBe('Only the host can manage bots'));
  send(host, 'lobby:addBot');
  send(host, 'lobby:addBot');
  await vi.waitFor(() => expect(roster.filter((player) => player.bot)).toHaveLength(2));
  send(host, 'lobby:addBot');
  await vi.waitFor(() => expect(results.get(host)!.at(-1)?.reason).toBe('Room is full'));
  const full = await post(`/api/rooms/${code}/join`, 'Green');
  expect(full).toMatchObject({ status: 409, body: { error: 'Room is full' } });
  const bots = roster.filter((player) => player.bot);
  expect(bots.every((bot) => bot.ready && bot.character && bot.connected)).toBe(true);
  expect(new Set(roster.map((player) => player.character).filter(Boolean)).size).toBe(2);

  send(host, 'lobby:removeBot', { botId: 'nobody' });
  await vi.waitFor(() => expect(results.get(host)!.at(-1)?.reason).toBe('Unknown bot'));
  send(host, 'lobby:removeBot', { botId: bots[1]!.id });
  await vi.waitFor(() => expect(roster.filter((player) => player.bot)).toHaveLength(1));
  const spare = ['Chansey', 'Audino', 'Machoke', 'Meowth'].find((character) => character !== bots[0]!.character)!;
  send(guest, 'lobby:botCharacter', { botId: bots[0]!.id, character: spare });
  send(host, 'lobby:botCharacter', { botId: bots[0]!.id, character: 'Mew' });
  await vi.waitFor(() => expect(results.get(host)!.at(-1)?.reason).toBe('Choose a valid character'));
  send(host, 'lobby:botCharacter', { botId: bots[0]!.id, character: spare });
  await vi.waitFor(() => expect(roster.find((player) => player.id === bots[0]!.id)?.character).toBe(spare));
  expect(results.get(guest)!.at(-1)?.reason).toBe('Only the host can manage bots');
  send(host, 'player:select', { character: spare });
  await vi.waitFor(() => expect(state().players.get(host.sessionId)?.character).toBe(spare));
  expect(state().players.get(bots[0]!.id)?.character).not.toBe(spare);
  send(guest, 'player:select', { character: [...['Chansey', 'Audino', 'Machoke', 'Meowth']]
    .find((character) => ![...state().players.values()].some((player) => player.character === character)) });
  send(host, 'player:ready', { ready: true });
  send(guest, 'player:ready', { ready: true });
  await vi.waitFor(() => expect([...state().players.values()].every((player) => player.ready)).toBe(true));
  send(host, 'game:start');
  await vi.waitFor(() => expect(state().phase).toBe('running'));
  const botId = bots[0]!.id;
  const spawn = { x: state().players.get(botId)!.x, y: state().players.get(botId)!.y };
  await vi.waitFor(() => {
    const bot = state().players.get(botId)!;
    expect(Math.hypot(bot.x - spawn.x, bot.y - spawn.y)).toBeGreaterThan(20);
  }, { timeout: 4000 });

  send(host, 'lobby:addBot');
  await vi.waitFor(() => expect(results.get(host)!.at(-1)?.reason).toBe('Bots can only change in the lobby'));
  const local = matchMaker.getLocalRoomById(host.roomId) as unknown as { state: RoomState };
  await guest.leave();
  await vi.waitFor(() => expect(local.state.players.has(guest.sessionId)).toBe(false));
  expect(local.state.players.has(botId)).toBe(true);
  await host.leave();
  await vi.waitFor(() => expect(local.state.players.size).toBe(0));
  clients.splice(0);
}, 15_000);
