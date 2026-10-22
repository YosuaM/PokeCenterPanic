import {
  moveWithinMap, PLAYER_SPEED, SPAWN_POINTS,
  type Direction, type PlayerInput, type Point,
} from '@pokecenter/shared';

interface TrackedPlayer {
  position: Point;
  slot: number;
  connected: boolean;
  direction: Direction | null;
  facing: Direction;
  lastInputAt: number;
  sequence: number;
}

export class RoomMovement {
  private readonly players = new Map<string, TrackedPlayer>();

  add(id: string): { position: Point; slot: number } {
    const usedSlots = new Set([...this.players.values()].map((player) => player.slot));
    const slot = SPAWN_POINTS.findIndex((_, index) => !usedSlots.has(index));
    if (slot < 0 || this.players.has(id)) throw new Error('No available player spawn');
    const position = { ...SPAWN_POINTS[slot]! };
    this.players.set(id, { position, slot, connected: true, direction: null, facing: 'up',
      lastInputAt: 0, sequence: 0 });
    return { position, slot };
  }

  suspend(id: string): void {
    const player = this.players.get(id);
    if (!player) return;
    player.connected = false;
    player.direction = null;
  }

  resume(id: string): Point | undefined {
    const player = this.players.get(id);
    if (!player) return undefined;
    player.position = { ...SPAWN_POINTS[player.slot]! };
    player.connected = true;
    player.direction = null;
    player.facing = 'up';
    player.lastInputAt = 0;
    return player.position;
  }

  remove(id: string): void {
    this.players.delete(id);
  }

  stopAll(): void {
    for (const player of this.players.values()) player.direction = null;
  }

  resetRound(): void {
    for (const player of this.players.values()) {
      player.position = { ...SPAWN_POINTS[player.slot]! };
      player.direction = null;
      player.facing = 'up';
      player.lastInputAt = 0;
    }
  }

  accept(id: string, value: unknown, now: number, roundId: string | null = null): boolean {
    const player = this.players.get(id);
    if (!player?.connected || !isPlayerInput(value) || value.roundId !== roundId ||
      value.sequence <= player.sequence) return false;
    player.sequence = value.sequence;
    player.direction = value.direction;
    if (value.direction) player.facing = value.direction;
    player.lastInputAt = now;
    return true;
  }

  acceptAction(id: string, sequence: number, roundId: string, currentRoundId: string): boolean {
    const player = this.players.get(id);
    if (!player?.connected || roundId !== currentRoundId || !Number.isSafeInteger(sequence) ||
      sequence <= player.sequence) return false;
    player.sequence = sequence;
    return true;
  }

  isStationary(id: string, now: number): boolean {
    const player = this.players.get(id);
    return Boolean(player?.connected && (!player.direction || now - player.lastInputAt >= 250));
  }

  advance(elapsedMs: number, now: number): void {
    const distance = PLAYER_SPEED * Math.min(Math.max(elapsedMs, 0), 100) / 1000;
    for (const player of this.players.values()) {
      if (!player.connected) continue;
      if (player.direction && now - player.lastInputAt >= 250) player.direction = null;
      if (player.direction) player.position = moveWithinMap(player.position, player.direction, distance);
    }
  }

  position(id: string): Point | undefined {
    const player = this.players.get(id);
    return player?.connected ? player.position : undefined;
  }

  facing(id: string): Direction | undefined {
    const player = this.players.get(id);
    return player?.connected ? player.facing : undefined;
  }

  lastSequence(id: string): number { return this.players.get(id)?.sequence ?? 0; }
}

function isPlayerInput(value: unknown): value is PlayerInput {
  if (typeof value !== 'object' || value === null) return false;
  const input = value as Partial<PlayerInput>;
  return (input.roundId === null || typeof input.roundId === 'string') &&
    Number.isSafeInteger(input.sequence) && Number(input.sequence) > 0 &&
    (input.interactHeld === undefined || typeof input.interactHeld === 'boolean') &&
    (input.direction === null || input.direction === 'up' || input.direction === 'down' ||
      input.direction === 'left' || input.direction === 'right');
}
