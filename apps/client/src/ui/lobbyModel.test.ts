import { describe, expect, it } from 'vitest';
import type { PlayerPresence } from '@pokecenter/shared';
import { canStart, cycleCharacter, inviteLink, invitedCode, lobbyHint, openSeats } from './lobbyModel.js';

const red: PlayerPresence = { id: 'red', name: 'Red', slot: 0, character: 'Chansey', ready: true, connected: true };
const blue: PlayerPresence = { id: 'blue', name: 'Blue', slot: 1, character: 'Audino', ready: true, connected: true };
const bot: PlayerPresence = { id: 'bot-1', name: 'Bot 3', slot: 2, character: 'Machoke', ready: true, connected: true, bot: true };

describe('invite links', () => {
  it('builds a clean link to the current page with only the room code', () => {
    expect(inviteLink('https://play.example/panic/?artFixture=x#menu', 'ABC234'))
      .toBe('https://play.example/panic/?room=ABC234');
    expect(inviteLink('http://127.0.0.1:5173/', 'QW3ERT')).toBe('http://127.0.0.1:5173/?room=QW3ERT');
    expect(() => inviteLink('not a url', 'ABC234')).toThrow();
  });

  it('reads a normalised six-character code and ignores anything else', () => {
    expect(invitedCode('?room=abc234')).toBe('ABC234');
    expect(invitedCode('?x=1&room=%20QW3ERT%20')).toBe('QW3ERT');
    expect(invitedCode('')).toBeNull();
    expect(invitedCode('?room=ABC23')).toBeNull();
    expect(invitedCode('?room=ABC2345')).toBeNull();
    expect(invitedCode('?room=<script>')).toBeNull();
  });
});

describe('bot Pokémon cycling', () => {
  it('steps in roster order past Pokémon other players hold', () => {
    expect(cycleCharacter(bot, [red, bot], 1)).toBe('Meowth');
    expect(cycleCharacter(bot, [red, bot], -1)).toBe('Audino');
    expect(cycleCharacter(bot, [red, blue, bot], -1)).toBe('Meowth');
    expect(cycleCharacter({ ...bot, character: 'Meowth' }, [red, bot], 1)).toBe('Audino');
    expect(cycleCharacter(bot, [red, blue, bot, { ...blue, id: 'm', character: 'Meowth' }], 1)).toBeNull();
  });

  it('starts from the first Pokémon when the bot has none', () => {
    expect(cycleCharacter({ ...bot, character: undefined }, [red, { ...bot, character: undefined }], 1)).toBe('Audino');
  });
});

describe('lobby readiness', () => {
  it('counts open seats and only allows a start with distinct, ready, connected Pokémon', () => {
    expect(openSeats([])).toBe(4);
    expect(openSeats([red, blue, bot])).toBe(1);
    expect(canStart([])).toBe(false);
    expect(canStart([red, blue, bot])).toBe(true);
    expect(canStart([red, { ...blue, ready: false }])).toBe(false);
    expect(canStart([red, { ...blue, character: 'Chansey' }])).toBe(false);
    expect(canStart([red, { ...blue, connected: false }])).toBe(false);
    expect(canStart([{ ...red, character: undefined }])).toBe(false);
  });

  it('tells each player the next step and who the team is waiting for', () => {
    expect(lobbyHint([], 'red', 'red')).toEqual({ text: 'Joining the room…', tone: 'waiting' });
    expect(lobbyHint([{ ...red, character: undefined }], 'red', 'red').tone).toBe('action');
    expect(lobbyHint([{ ...red, ready: false }], 'red', 'red').text).toContain('Press Ready');
    expect(lobbyHint([red, { ...blue, connected: false }], 'red', 'red').text).toBe('Waiting for Blue to reconnect…');
    expect(lobbyHint([red, { ...blue, ready: false }], 'red', 'red').text).toBe('Waiting for Blue to get ready…');
    const crowd = [red, ...['A', 'B', 'C'].map((name, slot) => ({ ...blue, id: name, name, slot, ready: false }))];
    expect(lobbyHint(crowd, 'red', 'red').text).toBe('Waiting for A, B +1 to get ready…');
    expect(lobbyHint([red, blue, bot], 'red', 'red')).toEqual({ text: 'Everyone is ready. Start the shift!', tone: 'ready' });
    expect(lobbyHint([red, blue], 'blue', 'red').text).toBe('Everyone is ready. Waiting for Red to start…');
    expect(lobbyHint([red, blue], 'blue', '').text).toBe('Everyone is ready. Waiting for the host to start…');
  });
});
