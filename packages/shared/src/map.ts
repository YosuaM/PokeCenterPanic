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
export const PLAYER_HALF_WIDTH = 40;
export const PLAYER_HALF_HEIGHT = 16;
export const WALK_BOUNDS = { left: -182, right: 1142, top: -174, bottom: 718 } as const;

export const SPAWN_POINTS: readonly Point[] = [
  { x: 456, y: 422 }, { x: 504, y: 422 },
  { x: 408, y: 422 }, { x: 552, y: 422 },
];

export const RECEPTION_SLOT_POSITIONS: readonly Point[] = [
  { x: 177, y: 298 }, { x: 369, y: 298 },
  { x: 561, y: 298 }, { x: 753, y: 298 },
];

export const RECEPTION_INTERACTION_POINTS: readonly Point[] =
  RECEPTION_SLOT_POSITIONS.map(({ x }) => ({ x, y: 344 }));
export const RECEPTION_COUNTER_BOUNDS: MapObstacle = { x: 82, y: 248, width: 796, height: 68 };

export const WAITING_SEATS_PER_BENCH = 4;
export const WAITING_BENCH_OBSTACLE_INDICES = [4, 7] as const;
export const WAITING_BENCHES: readonly MapObstacle[] = [
  { x: 82, y: 573, width: 240, height: 76 },
  { x: 758, y: 573, width: 240, height: 76 },
];
export const WAITING_SLOT_POSITIONS: readonly Point[] = WAITING_BENCHES.flatMap((bench) =>
  Array.from({ length: WAITING_SEATS_PER_BENCH }, (_, index) =>
    ({ x: bench.x + 48 + index * 54, y: bench.y + 32 })));

export const WAITING_INTERACTION_POINTS: readonly Point[] =
  WAITING_SLOT_POSITIONS.map(({ x, y }) => ({ x, y: y - 60 }));

export const RECOVERY_POSITION: Point = { x: 872, y: 185 };
export const RECOVERY_AREA_BOUNDS: MapObstacle = { x: 758, y: 153, width: 240, height: 76 };
export const RECOVERY_INTERACTION_POINT: Point = { x: 872, y: 125 };
export const HEALING_MACHINE_POSITION: Point = { x: 40, y: 33 };
export const HEALING_MACHINE_BOUNDS: MapObstacle = { x: -38, y: -26, width: 155, height: 117 };
export const HEALING_INTERACTION_POINT: Point = { x: 165, y: 33 };
export const HEALING_MACHINE_POSITIONS: readonly Point[] = [HEALING_MACHINE_POSITION, { x: 920, y: 33 }];
export const HEALING_MACHINE_FOOTPRINTS: readonly MapObstacle[] = [HEALING_MACHINE_BOUNDS,
  { x: 843, y: -26, width: 155, height: 117 }];
export const HEALING_INTERACTION_POINTS: readonly Point[] = [HEALING_INTERACTION_POINT, { x: 795, y: 33 }];
export const DISCHARGE_POSITION: Point = { x: 840, y: 298 };
export const DISCHARGE_INTERACTION_POINT: Point = { x: 840, y: 344 };
export const MEDICINE_TABLE_BOUNDS: MapObstacle = { x: 342, y: -36, width: 276, height: 102 };

export const CLINIC_DIVIDER: MapObstacle = { x: WALK_BOUNDS.left, y: 248, width: 264, height: 68 };
export const CLINIC_CORRIDOR: Point = { x: 1058, y: 344 };
export const RECEPTION_CHECK_IN_POINT: Point = { x: 480, y: 344 };

export const MAP_OBSTACLES: readonly MapObstacle[] = [
  RECEPTION_COUNTER_BOUNDS,
  HEALING_MACHINE_BOUNDS,
  HEALING_MACHINE_FOOTPRINTS[1]!,
  MEDICINE_TABLE_BOUNDS,
  WAITING_BENCHES[0]!,
  RECOVERY_AREA_BOUNDS,
  CLINIC_DIVIDER,
  WAITING_BENCHES[1]!,
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
    if (!isWalkable(next)) {
      let allowed = 0;
      let blocked = step;
      for (let iteration = 0; iteration < 10; iteration += 1) {
        const distanceToTest = (allowed + blocked) / 2;
        if (isWalkable({
          x: current.x + vector.x * distanceToTest,
          y: current.y + vector.y * distanceToTest,
        })) allowed = distanceToTest;
        else blocked = distanceToTest;
      }
      return { x: current.x + vector.x * allowed, y: current.y + vector.y * allowed };
    }
    current = next;
    remaining -= step;
  }
  return current;
}
