export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Point {
  x: number;
  y: number;
}

export interface MapObstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const TILE_SIZE = 48;
export const PLAYER_SPEED = TILE_SIZE * 3;
export const PLAYER_HALF_WIDTH = 13;
export const PLAYER_HALF_HEIGHT = 16;
export const WALK_BOUNDS = { left: 58, right: 902, top: 66, bottom: 478 } as const;

export const SPAWN_POINTS: readonly Point[] = [
  { x: 456, y: 422 }, { x: 504, y: 422 },
  { x: 408, y: 422 }, { x: 552, y: 422 },
];

export const RECEPTION_SLOT_POSITIONS: readonly Point[] = [
  { x: 177, y: 138 }, { x: 369, y: 138 },
  { x: 561, y: 138 }, { x: 753, y: 138 },
];

export const MAP_OBSTACLES: readonly MapObstacle[] = [
  { x: 82, y: 88, width: 796, height: 68 },
  { x: 82, y: 214, width: 155, height: 117 },
  { x: 723, y: 214, width: 155, height: 117 },
  { x: 342, y: 204, width: 276, height: 102 },
  { x: 82, y: 359, width: 240, height: 76 },
  { x: 638, y: 359, width: 240, height: 76 },
];

const DIRECTIONS: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function isWalkable(point: Point): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  if (point.x - PLAYER_HALF_WIDTH < WALK_BOUNDS.left ||
    point.x + PLAYER_HALF_WIDTH > WALK_BOUNDS.right ||
    point.y - PLAYER_HALF_HEIGHT < WALK_BOUNDS.top ||
    point.y + PLAYER_HALF_HEIGHT > WALK_BOUNDS.bottom) return false;

  return MAP_OBSTACLES.every((obstacle) =>
    point.x + PLAYER_HALF_WIDTH <= obstacle.x ||
    point.x - PLAYER_HALF_WIDTH >= obstacle.x + obstacle.width ||
    point.y + PLAYER_HALF_HEIGHT <= obstacle.y ||
    point.y - PLAYER_HALF_HEIGHT >= obstacle.y + obstacle.height);
}

export function moveWithinMap(position: Point, direction: Direction, distance: number): Point {
  if (!Number.isFinite(distance) || distance <= 0) return position;
  const vector = DIRECTIONS[direction];
  let current = position;
  let remaining = distance;
  while (remaining > 0) {
    const step = Math.min(remaining, 4);
    const next = { x: current.x + vector.x * step, y: current.y + vector.y * step };
    if (!isWalkable(next)) break;
    current = next;
    remaining -= step;
  }
  return current;
}
