import { HEALING_MACHINE_FOOTPRINTS, MEDICINE_SURFACE_POINTS, RECEPTION_INTERACTION_POINTS, WAITING_INTERACTION_POINTS,
  WALK_BOUNDS, isInteractionReachable, isWalkable,
  stationInteractionBounds, type Direction, type MapObstacle, type Point } from '@pokecenter/shared';

export const NAV_STEP = 8;
const NEIGHBORS: readonly [number, number][] = [[NAV_STEP, 0], [-NAV_STEP, 0], [0, NAV_STEP], [0, -NAV_STEP]];

const key = (point: Point): string => `${point.x},${point.y}`;

let walkableCells: Point[] | undefined;
const reachCache = new Map<string, Set<string>>();

function cells(): Point[] {
  walkableCells ??= (() => {
    const result: Point[] = [];
    const startX = Math.ceil(WALK_BOUNDS.left / NAV_STEP) * NAV_STEP;
    const startY = Math.ceil(WALK_BOUNDS.top / NAV_STEP) * NAV_STEP;
    for (let x = startX; x <= WALK_BOUNDS.right; x += NAV_STEP) {
      for (let y = startY; y <= WALK_BOUNDS.bottom; y += NAV_STEP) {
        if (isWalkable({ x, y })) result.push({ x, y });
      }
    }
    return result;
  })();
  return walkableCells;
}

/** Bounds or marker a target is reached through, matching the server's interaction rules. */
export function targetGeometry(targetId: string): MapObstacle | Point | undefined {
  const id = targetId.startsWith('medicine:apply:') ? targetId.slice('medicine:apply:'.length) : targetId;
  const surface = /^medicine:surface:([0-3])$/.exec(id);
  if (surface) return MEDICINE_SURFACE_POINTS[Number(surface[1])];
  const machine = /^healing:([01])$/.exec(id);
  if (machine) return HEALING_MACHINE_FOOTPRINTS[Number(machine[1])];
  return stationInteractionBounds(id);
}

/** Grid cells from which the target can be used; cached because the map is static. */
export function reachCells(targetId: string): Set<string> {
  const geometry = targetGeometry(targetId);
  const cacheKey = targetId.replace(/^medicine:apply:/, '');
  let result = reachCache.get(cacheKey);
  if (result) return result;
  const reach = new Set(geometry ? cells().filter((cell) => isInteractionReachable(cell, 'down', geometry)).map(key) :
    []);
  // Prefer cells whose walkable neighbors also reach, so steering tolerance cannot leave the area.
  const interior = new Set([...reach].filter((cell) => {
    const [x, y] = cell.split(',').map(Number);
    return NEIGHBORS.every(([dx, dy]) => {
      const neighbor = { x: x! + dx, y: y! + dy };
      return !isWalkable(neighbor) || reach.has(key(neighbor));
    });
  }));
  result = interior.size ? interior : reach;
  reachCache.set(cacheKey, result);
  return result;
}

/** Precomputes every station's reach area so the first round does not pay for it mid-tick. */
export function warmNavigation(): void {
  const targets = ['discharge', 'recovery', 'medicine:disposal', 'medicine:prep:0', 'medicine:prep:1',
    ...HEALING_MACHINE_FOOTPRINTS.map((_, index) => `healing:${index}`),
    ...MEDICINE_SURFACE_POINTS.map((_, index) => `medicine:surface:${index}`),
    ...RECEPTION_INTERACTION_POINTS.map((_, index) => `reception:${index}`),
    ...WAITING_INTERACTION_POINTS.map((_, index) => `waiting:${index}`)];
  for (const target of targets) reachCells(target);
}

function snap(position: Point): Point | undefined {
  const base = { x: Math.round(position.x / NAV_STEP) * NAV_STEP, y: Math.round(position.y / NAV_STEP) * NAV_STEP };
  let best: Point | undefined;
  let bestDistance = Infinity;
  for (let dx = -3; dx <= 3; dx += 1) {
    for (let dy = -3; dy <= 3; dy += 1) {
      const candidate = { x: base.x + dx * NAV_STEP, y: base.y + dy * NAV_STEP };
      const distance = Math.hypot(candidate.x - position.x, candidate.y - position.y);
      if (distance < bestDistance && isWalkable(candidate)) {
        best = candidate;
        bestDistance = distance;
      }
    }
  }
  return best;
}

export interface DistanceField {
  /** Route cost (walking distance plus edge penalties) to the nearest cell of a target, or Infinity. */
  distanceTo(goals: Set<string>): number;
  /** Corner waypoints of the shortest route to the nearest goal cell. */
  pathTo(goals: Set<string>): Point[] | undefined;
}

const EDGE_PENALTY = 4 * NAV_STEP;
const clearanceCache = new Map<string, boolean>();

/** Cells with at least one step of clearance on every side tolerate small steering errors. */
function clear(point: Point): boolean {
  const cellKey = key(point);
  let result = clearanceCache.get(cellKey);
  if (result === undefined) {
    result = NEIGHBORS.every(([dx, dy]) => isWalkable({ x: point.x + dx, y: point.y + dy }));
    clearanceCache.set(cellKey, result);
  }
  return result;
}

/** Binary min-heap of [cost, cell] pairs. */
class Frontier {
  private readonly items: [number, Point][] = [];
  get size(): number { return this.items.length; }
  push(item: [number, Point]): void {
    const items = this.items;
    items.push(item);
    for (let index = items.length - 1; index > 0;) {
      const parent = (index - 1) >> 1;
      if (items[parent]![0] <= items[index]![0]) break;
      [items[parent], items[index]] = [items[index]!, items[parent]!];
      index = parent;
    }
  }
  pop(): [number, Point] {
    const items = this.items;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length) {
      items[0] = last;
      for (let index = 0; ;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < items.length && items[left]![0] < items[smallest]![0]) smallest = left;
        if (right < items.length && items[right]![0] < items[smallest]![0]) smallest = right;
        if (smallest === index) break;
        [items[smallest], items[index]] = [items[index]!, items[smallest]!];
        index = smallest;
      }
    }
    return top;
  }
}

/**
 * One shortest-path search from a position answers distance and path queries for every target.
 * Routes prefer cells away from obstacle edges so steering tolerance never clips a corner.
 */
export function distanceField(position: Point): DistanceField {
  const start = snap(position);
  const distances = new Map<string, number>();
  const previous = new Map<string, string>();
  if (start) {
    distances.set(key(start), 0);
    const frontier = new Frontier();
    frontier.push([0, start]);
    while (frontier.size) {
      const [cost, point] = frontier.pop();
      const current = key(point);
      if (cost > distances.get(current)!) continue;
      for (const [dx, dy] of NEIGHBORS) {
        const next = { x: point.x + dx, y: point.y + dy };
        if (!isWalkable(next)) continue;
        const nextKey = key(next);
        const nextCost = cost + NAV_STEP + (clear(next) ? 0 : EDGE_PENALTY);
        if (nextCost >= (distances.get(nextKey) ?? Infinity)) continue;
        distances.set(nextKey, nextCost);
        previous.set(nextKey, current);
        frontier.push([nextCost, next]);
      }
    }
  }
  const nearest = (goals: Set<string>): string | undefined => {
    let best: string | undefined;
    let bestDistance = Infinity;
    for (const goal of goals) {
      const distance = distances.get(goal);
      if (distance !== undefined && distance < bestDistance) {
        best = goal;
        bestDistance = distance;
      }
    }
    return best;
  };
  return {
    distanceTo(goals) {
      const goal = nearest(goals);
      return goal === undefined ? Infinity : distances.get(goal)!;
    },
    pathTo(goals) {
      const goal = nearest(goals);
      if (goal === undefined) return undefined;
      const route: Point[] = [];
      for (let cursor: string | undefined = goal; cursor; cursor = previous.get(cursor)) {
        const [x, y] = cursor.split(',').map(Number);
        route.unshift({ x: x!, y: y! });
      }
      // Keep only turning points; straight runs need no intermediate waypoints.
      return route.filter((point, index) => {
        const before = route[index - 1];
        const after = route[index + 1];
        return !before || !after || (before.x !== after.x && before.y !== after.y);
      });
    },
  };
}

const OPPOSITE: Readonly<Record<Direction, Direction>> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/**
 * Cardinal direction toward the next waypoint, dropping waypoints already reached. A tick moves up to
 * about 8.6 units, so the per-axis tolerance must exceed half a step; reversing on the same axis means
 * the waypoint was just crossed, which also counts as reached.
 */
export function steer(position: Point, path: Point[], previous: Direction | null = null,
  tolerance = 5): Direction | null {
  for (;;) {
    const next = path[0];
    if (!next) return null;
    const dx = next.x - position.x;
    const dy = next.y - position.y;
    const direction: Direction | null = Math.abs(dx) > tolerance ? dx > 0 ? 'right' : 'left' :
      Math.abs(dy) > tolerance ? dy > 0 ? 'down' : 'up' : null;
    if (direction && (!previous || direction !== OPPOSITE[previous])) return direction;
    path.shift();
  }
}
