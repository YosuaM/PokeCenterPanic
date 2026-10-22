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
// Compact 22 × 14 tile clinic centered on the 960 × 540 presentation origin (480, 270).
export const WALK_BOUNDS = { left: -48, right: 1008, top: -66, bottom: 606 } as const;

export const SPAWN_POINTS: readonly Point[] = [
  { x: 456, y: 190 }, { x: 504, y: 190 },
  { x: 408, y: 190 }, { x: 552, y: 190 },
];

/** The central counter separates the public lobby (front) from treatment (back). */
export const RECEPTION_COUNTER_BOUNDS: MapObstacle = { x: 312, y: 250, width: 336, height: 68 };
export const RECEPTION_SLOT_POSITIONS: readonly Point[] = [
  { x: 348, y: 290 }, { x: 412, y: 290 },
  { x: 548, y: 290 }, { x: 612, y: 290 },
];
export const RECEPTION_INTERACTION_POINTS: readonly Point[] =
  RECEPTION_SLOT_POSITIONS.map(({ x }) => ({ x, y: 334 }));
export const DISCHARGE_POSITION: Point = { x: 480, y: 290 };
export const DISCHARGE_INTERACTION_POINT: Point = { x: 480, y: 334 };
export const RECEPTION_CHECK_IN_POINT: Point = { x: 480, y: 334 };

export const WAITING_SEATS_PER_BENCH = 4;
export const WAITING_BENCH_OBSTACLE_INDICES = [4, 7] as const;
export const WAITING_BENCHES: readonly MapObstacle[] = [
  { x: -28, y: 520, width: 240, height: 76 },
  { x: 748, y: 520, width: 240, height: 76 },
];
export const WAITING_SLOT_POSITIONS: readonly Point[] = WAITING_BENCHES.flatMap((bench) =>
  Array.from({ length: WAITING_SEATS_PER_BENCH }, (_, index) =>
    ({ x: bench.x + 39 + index * 54, y: bench.y + 32 })));
export const WAITING_INTERACTION_POINTS: readonly Point[] =
  WAITING_SLOT_POSITIONS.map(({ x, y }) => ({ x, y: y - 60 }));

/** Recovery closes the right end of the counter row; the PC corner closes the left end. */
export const RECOVERY_AREA_BOUNDS: MapObstacle = { x: 768, y: 250, width: 240, height: 76 };
export const RECOVERY_POSITION: Point = { x: 882, y: 282 };
export const RECOVERY_INTERACTION_POINT: Point = { x: 882, y: 342 };
export const PC_CORNER_BOUNDS: MapObstacle = { x: -48, y: 250, width: 240, height: 68 };
/** Walkable gaps through the counter row, between the PC corner, counter and recovery. */
export const CLINIC_PASSAGES: readonly MapObstacle[] = [
  { x: 192, y: 250, width: 120, height: 68 },
  { x: 648, y: 250, width: 120, height: 76 },
];

export const HEALING_MACHINE_BOUNDS: MapObstacle = { x: -28, y: -59, width: 155, height: 117 };
export const HEALING_MACHINE_POSITION: Point = { x: 50, y: 0 };
export const HEALING_INTERACTION_POINT: Point = { x: 50, y: 74 };
export const HEALING_MACHINE_POSITIONS: readonly Point[] = [HEALING_MACHINE_POSITION, { x: 910, y: 0 }];
export const HEALING_MACHINE_FOOTPRINTS: readonly MapObstacle[] = [HEALING_MACHINE_BOUNDS,
  { x: 833, y: -59, width: 155, height: 117 }];
export const HEALING_INTERACTION_POINTS: readonly Point[] = [HEALING_INTERACTION_POINT, { x: 910, y: 74 }];
export const MEDICINE_TABLE_BOUNDS: MapObstacle = { x: 342, y: -60, width: 276, height: 102 };

/** Potted plants flanking the entrance. */
export const LOBBY_PLANTS: readonly MapObstacle[] = [
  { x: 258, y: 544, width: 56, height: 56 },
  { x: 646, y: 544, width: 56, height: 56 },
];

export const MAP_OBSTACLES: readonly MapObstacle[] = [
  RECEPTION_COUNTER_BOUNDS,
  HEALING_MACHINE_BOUNDS,
  HEALING_MACHINE_FOOTPRINTS[1]!,
  MEDICINE_TABLE_BOUNDS,
  WAITING_BENCHES[0]!,
  RECOVERY_AREA_BOUNDS,
  PC_CORNER_BOUNDS,
  WAITING_BENCHES[1]!,
  ...LOBBY_PLANTS,
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
