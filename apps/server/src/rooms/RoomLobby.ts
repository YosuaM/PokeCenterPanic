import { randomUUID } from 'node:crypto';
import { PLAYER_CHARACTERS, type PlayerCharacter, type RoomPhase } from '@pokecenter/shared';
import type { RoomState } from './RoomState.js';

export interface LobbyResult { ok: boolean; reason: string }

function reject(reason: string): LobbyResult { return { ok: false, reason }; }
const accepted: LobbyResult = { ok: true, reason: '' };

export function oldestConnectedMember(members: Iterable<{ id: string; joinOrder: number }>): string {
  let oldest: { id: string; joinOrder: number } | undefined;
  for (const member of members) {
    if (!oldest || member.joinOrder < oldest.joinOrder ||
      (member.joinOrder === oldest.joinOrder && member.id < oldest.id)) oldest = member;
  }
  return oldest?.id ?? '';
}

export class RoomLobby {
  private countdownEndsAt = 0;
  private readonly sequences = new Map<string, number>();
  private readonly joinOrder = new Map<string, number>();
  private readonly connected = new Set<string>();
  private readonly bots = new Set<string>();
  private nextJoinOrder = 0;

  constructor(private readonly state: RoomState, private readonly countdownMs = 3_000,
    private readonly nextRoundId: () => string = randomUUID) {
    state.phase = 'lobby';
    state.hostId = '';
    state.roundId = '';
    state.countdownRemainingMs = 0;
  }

  select(playerId: string, value: unknown): LobbyResult {
    const command = this.consume(playerId, value);
    if (!command) return reject('Invalid or repeated lobby command');
    if (this.state.phase !== 'lobby') return reject('Character selection is only available in the lobby');
    const character = (value as { character?: unknown }).character;
    const player = this.state.players.get(playerId)!;
    if (character === null) {
      player.character = '';
      player.ready = false;
      return accepted;
    }
    if (!PLAYER_CHARACTERS.includes(character as PlayerCharacter)) return reject('Choose a valid character');
    const holder = [...this.state.players].find(([id, member]) => id !== playerId && member.character === character);
    if (holder && !this.bots.has(holder[0])) return reject('This Pokémon is already chosen by another player');
    if (holder) {
      // Bots give way to people: the bot takes another free Pokémon instead.
      const free = this.freeCharacters().filter((candidate) => candidate !== character);
      if (!free.length) return reject('This Pokémon is already chosen by another player');
      holder[1].character = free[0]!;
    }
    if (player.character === character) return accepted;
    player.character = character as PlayerCharacter;
    player.ready = false;
    return accepted;
  }

  ready(playerId: string, value: unknown): LobbyResult {
    const command = this.consume(playerId, value);
    if (!command) return reject('Invalid or repeated lobby command');
    if (this.state.phase !== 'lobby') return reject('Ready status is only available in the lobby');
    const ready = (value as { ready?: unknown }).ready;
    if (typeof ready !== 'boolean') return reject('Invalid ready status');
    const player = this.state.players.get(playerId)!;
    if (ready && !PLAYER_CHARACTERS.includes(player.character as PlayerCharacter)) {
      return reject('Choose a character first');
    }
    player.ready = ready;
    return accepted;
  }

  start(playerId: string, value: unknown, now: number): LobbyResult {
    const command = this.consume(playerId, value);
    if (!command) return reject('Invalid or repeated lobby command');
    if (this.state.phase !== 'lobby') return reject('Game is not in the lobby');
    if (this.state.hostId !== playerId) return reject('Only the host can start');
    const players = [...this.state.players.values()];
    if (!players.length || players.length !== this.connected.size + this.bots.size || players.some((player) => !player.ready ||
      !PLAYER_CHARACTERS.includes(player.character as PlayerCharacter)) ||
      new Set(players.map((player) => player.character)).size !== players.length) {
      return reject('All players must choose a character and be ready');
    }
    this.state.roundId = this.nextRoundId();
    this.state.phase = 'countdown';
    this.countdownEndsAt = now + this.countdownMs;
    this.state.countdownRemainingMs = this.countdownMs;
    return accepted;
  }

  advance(now: number): boolean {
    if (this.state.phase !== 'countdown') return false;
    this.state.countdownRemainingMs = Math.max(0, this.countdownEndsAt - now);
    if (this.state.countdownRemainingMs > 0) return false;
    this.state.phase = 'running';
    return true;
  }

  joined(playerId: string): void {
    if (!this.joinOrder.has(playerId)) this.joinOrder.set(playerId, this.nextJoinOrder++);
    this.connected.add(playerId);
    if (!this.state.hostId) this.state.hostId = playerId;
  }

  departed(playerId: string, reserveSeat = false): void {
    this.connected.delete(playerId);
    if (!reserveSeat) {
      this.sequences.delete(playerId);
      this.joinOrder.delete(playerId);
    }
    const departingPlayer = this.state.players.get(playerId);
    if (departingPlayer) departingPlayer.ready = false;
    if (this.state.phase === 'countdown') {
      this.state.phase = 'lobby';
      this.state.roundId = '';
      this.state.countdownRemainingMs = 0;
      this.countdownEndsAt = 0;
      this.clearReady();
    }
    if (this.state.hostId === playerId) {
      this.state.hostId = oldestConnectedMember([...this.connected].map((id) => ({
        id, joinOrder: this.joinOrder.get(id)!,
      })));
    }
  }

  phase(): RoomPhase { return this.state.phase as RoomPhase; }

  lastSequence(playerId: string): number { return this.sequences.get(playerId) ?? 0; }

  replay(playerId: string, value: unknown): LobbyResult {
    if (!value || typeof value !== 'object' || this.state.phase !== 'results') {
      return reject('Replay is only available after results');
    }
    const command = value as { sequence?: unknown; roundId?: unknown };
    if (!this.connected.has(playerId) || command.roundId !== this.state.roundId ||
      !Number.isSafeInteger(command.sequence) || Number(command.sequence) <= this.lastSequence(playerId)) {
      return reject('Invalid or repeated replay command');
    }
    this.sequences.set(playerId, Number(command.sequence));
    if (this.state.hostId !== playerId) return reject('Only the host can return to the lobby');
    this.state.phase = 'lobby';
    this.state.roundId = '';
    this.state.countdownRemainingMs = 0;
    this.countdownEndsAt = 0;
    this.clearReady();
    return accepted;
  }

  /** Validates a host-only lobby command such as adding or removing a bot. */
  hostCommand(playerId: string, value: unknown): LobbyResult {
    if (!this.consume(playerId, value)) return reject('Invalid or repeated lobby command');
    if (this.state.phase !== 'lobby') return reject('Bots can only change in the lobby');
    if (this.state.hostId !== playerId) return reject('Only the host can manage bots');
    return accepted;
  }

  addBot(botId: string): void { this.bots.add(botId); }

  removeBot(botId: string): void { this.bots.delete(botId); }

  isBot(playerId: string): boolean { return this.bots.has(playerId); }

  humanCount(): number { return this.connected.size; }

  freeCharacters(): PlayerCharacter[] {
    const taken = new Set([...this.state.players.values()].map((player) => player.character));
    return PLAYER_CHARACTERS.filter((character) => !taken.has(character));
  }

  private clearReady(): void {
    for (const [id, player] of this.state.players) player.ready = this.bots.has(id);
  }

  resetEmpty(): void {
    if (this.state.players.size || this.connected.size) return;
    this.state.phase = 'lobby';
    this.state.hostId = '';
    this.state.roundId = '';
    this.state.countdownRemainingMs = 0;
    this.countdownEndsAt = 0;
  }

  private consume(playerId: string, value: unknown): boolean {
    if (!this.connected.has(playerId) || !this.state.players.has(playerId) || typeof value !== 'object' || value === null) return false;
    const command = value as { sequence?: unknown; roundId?: unknown };
    if (command.roundId !== null || !Number.isSafeInteger(command.sequence) ||
      Number(command.sequence) <= (this.sequences.get(playerId) ?? 0)) return false;
    this.sequences.set(playerId, Number(command.sequence));
    return true;
  }
}
