import { describe, expect, it } from 'vitest';
import { PlayerState, RoomState } from './RoomState.js';
import { oldestConnectedMember, RoomLobby } from './RoomLobby.js';

function setup(ids = ['red', 'blue']) {
  const state = new RoomState();
  const lobby = new RoomLobby(state, 3_000, () => 'round-1');
  for (const id of ids) {
    const player = new PlayerState();
    player.name = id;
    player.character = '';
    player.ready = false;
    state.players.set(id, player);
    lobby.joined(id);
  }
  let sequence = 0;
  const command = (fields: Record<string, unknown> = {}) => ({ sequence: ++sequence,
    roundId: null, ...fields });
  return { state, lobby, command };
}

describe('RoomLobby', () => {
  it('elects by join order and then ID when orders tie', () => {
    expect(oldestConnectedMember([
      { id: 'green', joinOrder: 2 }, { id: 'blue', joinOrder: 1 },
      { id: 'red', joinOrder: 1 },
    ])).toBe('blue');
    expect(oldestConnectedMember([])).toBe('');
  });

  it('transfers control to the earliest connected member regardless of roster order', () => {
    const { state, lobby, command } = setup(['red', 'blue', 'green']);
    const blue = state.players.get('blue')!;
    state.players.delete('blue');
    state.players.set('blue', blue);
    state.players.delete('red');
    lobby.departed('red');
    expect(state.hostId).toBe('blue');
    for (const id of ['blue', 'green']) {
      expect(lobby.select(id, command({ character: 'Chansey' })).ok).toBe(true);
      expect(lobby.ready(id, command({ ready: true })).ok).toBe(true);
    }
    expect(lobby.start('green', command(), 0).reason).toBe('Only the host can start');
    expect(lobby.start('blue', command(), 0).ok).toBe(true);
  });

  it('keeps an incumbent host when a former host returns and elects on an empty room', () => {
    const { state, lobby, command } = setup();
    lobby.select('red', command({ character: 'Chansey' }));
    lobby.ready('red', command({ ready: true }));
    lobby.departed('red', true);
    expect(state.hostId).toBe('blue');
    expect(state.players.get('red')?.ready).toBe(false);
    lobby.select('blue', command({ character: 'Chansey' }));
    lobby.ready('blue', command({ ready: true }));
    expect(lobby.start('blue', command(), 0).reason)
      .toBe('All players must choose a character and be ready');
    lobby.joined('red');
    expect(state.hostId).toBe('blue');
    lobby.departed('blue', true);
    expect(state.hostId).toBe('red');
    lobby.departed('red', true);
    expect(state.hostId).toBe('');
    lobby.joined('blue');
    expect(state.hostId).toBe('blue');
    lobby.joined('red');
    expect(state.hostId).toBe('blue');
  });

  it('starts only for a ready roster and the host, then enters running after three seconds', () => {
    const { state, lobby, command } = setup();
    expect(state.phase).toBe('lobby');
    expect(state.hostId).toBe('red');
    expect(lobby.start('red', command(), 100)).toEqual({ ok: false,
      reason: 'All players must choose a character and be ready' });
    expect(lobby.ready('red', command({ ready: true })).ok).toBe(false);
    expect(lobby.select('red', command({ character: 'Chansey' })).ok).toBe(true);
    expect(lobby.ready('red', command({ ready: true })).ok).toBe(true);
    expect(lobby.select('blue', command({ character: 'Chansey' })).ok).toBe(true);
    expect(lobby.ready('blue', command({ ready: true })).ok).toBe(true);
    expect(lobby.start('blue', command(), 100).reason).toBe('Only the host can start');
    expect(lobby.start('red', command(), 100).ok).toBe(true);
    expect(state.phase).toBe('countdown');
    expect(state.roundId).toBe('round-1');
    expect(lobby.advance(3_099)).toBe(false);
    expect(state.countdownRemainingMs).toBe(1);
    expect(lobby.advance(3_100)).toBe(true);
    expect(state.phase).toBe('running');
    expect(lobby.advance(4_000)).toBe(false);
    expect(lobby.ready('red', command({ ready: false })).ok).toBe(false);
    expect(lobby.select('red', command({ character: 'Audino' })).ok).toBe(false);
  });

  it('clears readiness on character change and rejects invalid or repeated commands', () => {
    const { state, lobby, command } = setup();
    expect(lobby.select('red', command({ character: 'Invalid' })).reason).toBe('Choose a valid character');
    const selected = command({ character: 'Chansey' });
    expect(lobby.select('red', selected).ok).toBe(true);
    expect(lobby.select('red', selected).ok).toBe(false);
    expect(lobby.ready('red', command({ ready: true })).ok).toBe(true);
    expect(state.players.get('red')?.ready).toBe(true);
    expect(lobby.select('red', command({ character: 'Audino' })).ok).toBe(true);
    expect(state.players.get('red')?.ready).toBe(false);
    expect(lobby.ready('red', command({ ready: 'yes' })).ok).toBe(false);
    expect(lobby.select('unknown', command({ character: 'Meowth' })).ok).toBe(false);
    expect(state.phase).toBe('lobby');
  });

  it('cancels countdown when a player departs and transfers the host', () => {
    const { state, lobby, command } = setup();
    for (const id of ['red', 'blue']) {
      lobby.select(id, command({ character: 'Meowth' }));
      lobby.ready(id, command({ ready: true }));
    }
    expect(lobby.start('red', command(), 0).ok).toBe(true);
    state.players.delete('red');
    lobby.departed('red');
    expect(state.phase).toBe('lobby');
    expect(state.hostId).toBe('blue');
    expect(state.roundId).toBe('');
    expect(state.players.get('blue')?.ready).toBe(false);
    expect(lobby.advance(3_000)).toBe(false);
  });
});
