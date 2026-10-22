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
  it('reserves each Pokémon for one member and releases it on deselection without changing other players', () => {
    const { state, lobby, command } = setup();
    expect(lobby.select('red', command({ character: 'Meowth' })).ok).toBe(true);
    expect(lobby.select('blue', command({ character: 'Audino' })).ok).toBe(true);
    lobby.ready('blue', command({ ready: true }));
    expect(lobby.select('blue', command({ character: 'Meowth' })).reason).toContain('already chosen');
    expect(state.players.get('blue')).toMatchObject({ character: 'Audino', ready: true });
    expect(lobby.select('blue', command({ character: 'Audino' })).ok).toBe(true);
    expect(state.players.get('blue')?.ready).toBe(true);
    lobby.ready('red', command({ ready: true }));
    const clear = command({ character: null });
    expect(lobby.select('red', clear).ok).toBe(true);
    expect(state.players.get('red')).toMatchObject({ character: '', ready: false });
    expect(lobby.ready('red', command({ ready: true })).ok).toBe(false);
    expect(lobby.start('red', command(), 0).ok).toBe(false);
    expect(lobby.select('blue', command({ character: 'Meowth' })).ok).toBe(true);
    expect(state.players.get('blue')).toMatchObject({ character: 'Meowth', ready: false });
    expect(lobby.select('red', clear).ok).toBe(false);
    expect(lobby.select('red', command({ character: 'Meowth' })).ok).toBe(false);
    expect(lobby.select('red', command({ character: 'Audino' })).ok).toBe(true);
    for (const id of ['red', 'blue']) lobby.ready(id, command({ ready: true }));
    expect(lobby.start('red', command(), 0).ok).toBe(true);
  });

  it('retains choices for disconnected reservations and frees them only after the member leaves or expires', () => {
    const { state, lobby, command } = setup();
    lobby.select('red', command({ character: 'Chansey' }));
    lobby.departed('red', true);
    expect(lobby.select('blue', command({ character: 'Chansey' })).ok).toBe(false);
    expect(lobby.select('red', command({ character: null })).ok).toBe(false);
    lobby.joined('red');
    expect(state.players.get('red')?.character).toBe('Chansey');
    expect(lobby.select('blue', command({ character: 'Chansey' })).ok).toBe(false);
    state.players.delete('red'); lobby.departed('red');
    expect(lobby.select('blue', command({ character: 'Chansey' })).ok).toBe(true);
  });

  it('rejects malformed deselection and phase-locked changes, and refuses a duplicate roster at start', () => {
    const { state, lobby, command } = setup();
    lobby.select('red', command({ character: 'Chansey' }));
    lobby.select('blue', command({ character: 'Audino' }));
    for (const id of ['red', 'blue']) lobby.ready(id, command({ ready: true }));
    for (const character of [undefined, '', false, {}, []]) {
      expect(lobby.select('red', command({ character })).ok).toBe(false);
      expect(state.players.get('red')).toMatchObject({ character: 'Chansey', ready: true });
    }
    state.players.get('blue')!.character = 'Chansey';
    expect(lobby.start('red', command(), 0).ok).toBe(false);
    expect(state.phase).toBe('lobby');
    state.players.get('blue')!.character = 'Audino';
    expect(lobby.start('red', command(), 0).ok).toBe(true);
    for (const phase of ['countdown', 'running', 'results']) {
      state.phase = phase;
      expect(lobby.select('red', command({ character: null })).ok).toBe(false);
      expect(state.players.get('red')?.character).toBe('Chansey');
    }
  });

  it('allows only the connected host to replay the current results and preserves membership and characters', () => {
    const { state, lobby, command } = setup();
    for (const [index, id] of ['red', 'blue'].entries()) {
      lobby.select(id, command({ character: ['Meowth', 'Audino'][index] }));
      lobby.ready(id, command({ ready: true }));
    }
    expect(lobby.replay('red', command({ roundId: 'round-1' })).ok).toBe(false);
    lobby.start('red', command(), 0);
    lobby.advance(3000);
    state.phase = 'results';
    for (const value of [null, {}, command({ roundId: 'old' }), { sequence: 1, roundId: 'round-1' }]) {
      expect(lobby.replay('red', value).ok).toBe(false);
      expect(state.phase).toBe('results');
    }
    expect(lobby.replay('unknown', command({ roundId: 'round-1' })).ok).toBe(false);
    expect(lobby.replay('blue', command({ roundId: 'round-1' })).reason)
      .toBe('Only the host can return to the lobby');
    const replay = command({ roundId: 'round-1' });
    expect(lobby.replay('red', replay).ok).toBe(true);
    expect(state).toMatchObject({ phase: 'lobby', roundId: '', hostId: 'red', countdownRemainingMs: 0 });
    expect([...state.players.values()].map((player) => [player.character, player.ready]))
      .toEqual([['Meowth', false], ['Audino', false]]);
    expect(lobby.replay('red', replay).ok).toBe(false);
    lobby.departed('red', true);
    expect(state.hostId).toBe('blue');
  });

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
    for (const [index, id] of ['blue', 'green'].entries()) {
      expect(lobby.select(id, command({ character: ['Chansey', 'Audino'][index] })).ok).toBe(true);
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
    lobby.select('blue', command({ character: 'Audino' }));
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
    expect(lobby.select('blue', command({ character: 'Audino' })).ok).toBe(true);
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
    for (const [index, id] of ['red', 'blue'].entries()) {
      lobby.select(id, command({ character: ['Meowth', 'Audino'][index] }));
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
