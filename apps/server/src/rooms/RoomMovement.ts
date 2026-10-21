import {
  moveWithinMap, PLAYER_SPEED, SPAWN_POINTS,
  type Direction, type PlayerInput, type Point,
} from '@pokecenter/shared';

interface TrackedPlayer {
  position: Point;
  slot: number;
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
    this.players.set(id, { position, slot, direction: null, facing: 'up', lastInputAt: 0, sequence: 0 });
    return { position, slot };
  }

  remove(id: string): void {
    this.players.delete(id);
  }

  accept(id: string, value: unknown, now: number): boolean {
    const player = this.players.get(id);
    if (!player || !isPlayerInput(value) || value.sequence <= player.sequence) return false;
    player.sequence = value.sequence;
    player.direction = value.direction;
    if (value.direction) player.facing = value.direction;
    player.lastInputAt = now;
    return true;
  }

  advance(elapsedMs: number, now: number): void {
    const distance = PLAYER_SPEED * Math.min(Math.max(elapsedMs, 0), 100) / 1000;
    for (const player of this.players.values()) {
      if (player.direction && now - player.lastInputAt >= 250) player.direction = null;
      if (player.direction) player.position = moveWithinMap(player.position, player.direction, distance);
    }
  }

  position(id: string): Point | undefined {
    return this.players.get(id)?.position;
  }

  facing(id: string): Direction | undefined {
    return this.players.get(id)?.facing;
  }
}

function isPlayerInput(value: unknown): value is PlayerInput {
  if (typeof value !== 'object' || value === null) return false;
  const input = value as Partial<PlayerInput>;
  return input.roundId === null &&
    Number.isSafeInteger(input.sequence) && Number(input.sequence) > 0 &&
    (input.direction === null || input.direction === 'up' || input.direction === 'down' ||
      input.direction === 'left' || input.direction === 'right');
}
