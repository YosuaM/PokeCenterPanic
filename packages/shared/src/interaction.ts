import { isWalkable, type Direction, type Point, TILE_SIZE } from './map.js';

export interface InteractionTarget {
  id: string;
  position: Point;
  expectedOccupantId: string;
  label: string;
}

const FACING_VECTOR: Record<Direction, Point> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};

export function isInteractionReachable(player: Point, facing: Direction, target: Point): boolean {
  if (!isWalkable(player) || !isWalkable(target)) return false;
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const distance = Math.hypot(dx, dy);
  const vector = FACING_VECTOR[facing];
  if (distance > TILE_SIZE || (distance > 0 && dx * vector.x + dy * vector.y <= 0)) return false;
  for (let traveled = 4; traveled < distance; traveled += 4) {
    const fraction = traveled / distance;
    if (!isWalkable({ x: player.x + dx * fraction, y: player.y + dy * fraction })) return false;
  }
  return true;
}

export function selectInteractionTarget(player: Point, facing: Direction,
  targets: readonly InteractionTarget[]): InteractionTarget | null {
  let selected: InteractionTarget | null = null;
  let selectedDistance = Infinity;
  for (const target of targets) {
    if (!isInteractionReachable(player, facing, target.position)) continue;
    const dx = target.position.x - player.x;
    const dy = target.position.y - player.y;
    const distance = dx * dx + dy * dy;
    if (distance < selectedDistance || (distance === selectedDistance && target.id < (selected?.id ?? ''))) {
      selected = target;
      selectedDistance = distance;
    }
  }
  return selected;
}
