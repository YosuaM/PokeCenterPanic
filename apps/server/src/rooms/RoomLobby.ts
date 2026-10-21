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
    if (!PLAYER_CHARACTERS.includes(character as PlayerCharacter)) return reject('Choose a valid character');
    const player = this.state.players.get(playerId)!;
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
    if (!players.length || players.length !== this.connected.size || players.some((player) => !player.ready ||
      !PLAYER_CHARACTERS.includes(player.character as PlayerCharacter))) {
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
      for (const player of this.state.players.values()) player.ready = false;
    }
    if (this.state.hostId === playerId) {
      this.state.hostId = oldestConnectedMember([...this.connected].map((id) => ({
        id, joinOrder: this.joinOrder.get(id)!,
      })));
    }
  }

  phase(): RoomPhase { return this.state.phase as RoomPhase; }

  lastSequence(playerId: string): number { return this.sequences.get(playerId) ?? 0; }

  resetEmpty(): void {
    if (this.state.players.size || this.connected.size) return;
    this.state.phase = 'lobby';
    this.state.hostId = '';
    this.state.roundId = '';
    this.state.countdownRemainingMs = 0;
    this.countdownEndsAt = 0;
  }

  private consume(playerId: string, value: unknown): boolean {
    if (!this.state.players.has(playerId) || typeof value !== 'object' || value === null) return false;
    const command = value as { sequence?: unknown; roundId?: unknown };
    if (command.roundId !== null || !Number.isSafeInteger(command.sequence) ||
      Number(command.sequence) <= (this.sequences.get(playerId) ?? 0)) return false;
    this.sequences.set(playerId, Number(command.sequence));
    return true;
  }
}
