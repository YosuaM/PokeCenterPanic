import { describe, expect, it } from 'vitest';
import { CLINIC_PASSAGES, MAP_OBSTACLES, PC_CORNER_BOUNDS, RECOVERY_AREA_BOUNDS, WALK_BOUNDS,
  PLAYER_HALF_HEIGHT, DISCHARGE_INTERACTION_POINT, HEALING_INTERACTION_POINTS, HEALING_MACHINE_FOOTPRINTS,
  isWalkable, moveWithinMap, PLAYER_HALF_WIDTH, RECEPTION_COUNTER_BOUNDS, RECEPTION_INTERACTION_POINTS,
  RECOVERY_INTERACTION_POINT, SPAWN_POINTS, WAITING_BENCHES, WAITING_INTERACTION_POINTS,
  type Point } from './map.js';
import { MEDICINE_DISPOSAL_POINT, MEDICINE_PREPARATION_POINTS,
  MEDICINE_SURFACE_POINTS } from './medicine.js';

const STEP = 8;

/** Breadth-first walking distances on an 8-unit grid, using the full player body. */
function walkingDistances(start: Point): Map<string, number> {
  const origin = { x: Math.round(start.x / STEP) * STEP, y: Math.round(start.y / STEP) * STEP };
  const distances = new Map([[`${origin.x},${origin.y}`, 0]]);
  const queue = [origin];
  for (let index = 0; index < queue.length; index += 1) {
    const point = queue[index]!;
    const distance = distances.get(`${point.x},${point.y}`)!;
    for (const [dx, dy] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]]) {
      const next = { x: point.x + dx!, y: point.y + dy! };
      const key = `${next.x},${next.y}`;
      if (distances.has(key) || !isWalkable(next)) continue;
      distances.set(key, distance + STEP);
      queue.push(next);
    }
  }
  return distances;
}

function walkingDistance(from: Point, to: Point): number {
  const distances = walkingDistances(from);
  let best = Infinity;
  for (const [key, distance] of distances) {
    const [x, y] = key.split(',').map(Number);
    if (Math.hypot(x! - to.x, y! - to.y) < STEP) best = Math.min(best, distance);
  }
  return best;
}

const interactionPoints = [...RECEPTION_INTERACTION_POINTS, ...WAITING_INTERACTION_POINTS,
  RECOVERY_INTERACTION_POINT, ...HEALING_INTERACTION_POINTS,
  DISCHARGE_INTERACTION_POINT, ...MEDICINE_PREPARATION_POINTS,
  MEDICINE_DISPOSAL_POINT, ...MEDICINE_SURFACE_POINTS];

describe('clinic map collisions', () => {
  it('uses a compact room split by a counter row with two walkable passages', () => {
    expect(WALK_BOUNDS.right - WALK_BOUNDS.left).toBe(22 * 48);
    expect(WALK_BOUNDS.bottom - WALK_BOUNDS.top).toBe(14 * 48);
    expect(WALK_BOUNDS.left + WALK_BOUNDS.right).toBe(2 * 480);
    expect(WALK_BOUNDS.top + WALK_BOUNDS.bottom).toBe(2 * 270);
    const counter = RECEPTION_COUNTER_BOUNDS;
    expect(PC_CORNER_BOUNDS.x).toBe(WALK_BOUNDS.left);
    expect(RECOVERY_AREA_BOUNDS.x + RECOVERY_AREA_BOUNDS.width).toBe(WALK_BOUNDS.right);
    expect(CLINIC_PASSAGES[0]!.x).toBe(PC_CORNER_BOUNDS.x + PC_CORNER_BOUNDS.width);
    expect(CLINIC_PASSAGES[0]!.x + CLINIC_PASSAGES[0]!.width).toBe(counter.x);
    expect(CLINIC_PASSAGES[1]!.x).toBe(counter.x + counter.width);
    expect(CLINIC_PASSAGES[1]!.x + CLINIC_PASSAGES[1]!.width).toBe(RECOVERY_AREA_BOUNDS.x);
    for (const passage of CLINIC_PASSAGES) {
      expect(passage.width).toBeGreaterThanOrEqual(2 * PLAYER_HALF_WIDTH + 32);
      const x = passage.x + passage.width / 2;
      for (let y = counter.y - 40; y <= counter.y + counter.height + 40; y += 4) {
        expect(isWalkable({ x, y }), `${x},${y}`).toBe(true);
      }
    }
    expect(WAITING_INTERACTION_POINTS.every((point) => point.y > counter.y + counter.height)).toBe(true);
    expect([...HEALING_INTERACTION_POINTS, ...MEDICINE_PREPARATION_POINTS, ...SPAWN_POINTS]
      .every((point) => point.y < counter.y)).toBe(true);
  });

  it('keeps the counter row solid outside the passages', () => {
    for (const x of [0, 150, 330, 480, 630, 800, 980]) {
      expect(isWalkable({ x, y: 284 }), String(x)).toBe(false);
    }
  });

  it('keeps all spawn points walkable behind the counter', () => {
    for (const spawn of SPAWN_POINTS) expect(isWalkable(spawn)).toBe(true);
  });

  it('keeps every station interaction point on walkable ground', () => {
    for (const point of interactionPoints) expect(isWalkable(point), JSON.stringify(point)).toBe(true);
  });

  it('keeps every interaction point reachable from the staff spawn with the wider player body', () => {
    const distances = walkingDistances(SPAWN_POINTS[0]!);
    for (const target of interactionPoints) {
      expect([...distances.keys()].some((key) => {
        const [x, y] = key.split(',').map(Number);
        return Math.hypot(x! - target.x, y! - target.y) < STEP;
      }), JSON.stringify(target)).toBe(true);
    }
  });

  it('keeps the main care routes short on both sides of the clinic', () => {
    const seatToMachine = [
      walkingDistance(WAITING_INTERACTION_POINTS[3]!, HEALING_INTERACTION_POINTS[0]!),
      walkingDistance(WAITING_INTERACTION_POINTS[4]!, HEALING_INTERACTION_POINTS[1]!),
    ];
    for (const distance of seatToMachine) expect(distance).toBeLessThanOrEqual(14 * 48);
    expect(Math.abs(seatToMachine[0]! - seatToMachine[1]!)).toBeLessThanOrEqual(48);
    // Staff can discharge across the counter from the treatment side.
    const dischargeFromBehind = { x: DISCHARGE_INTERACTION_POINT.x,
      y: RECEPTION_COUNTER_BOUNDS.y - PLAYER_HALF_HEIGHT };
    expect(isWalkable(dischargeFromBehind)).toBe(true);
    for (const machine of HEALING_INTERACTION_POINTS) {
      expect(walkingDistance(machine, dischargeFromBehind)).toBeLessThanOrEqual(13 * 48);
    }
    for (const [preparation, seat] of [[0, 0], [1, 7]] as const) {
      expect(walkingDistance(MEDICINE_PREPARATION_POINTS[preparation]!, WAITING_INTERACTION_POINTS[seat]!))
        .toBeLessThanOrEqual(18 * 48);
    }
  });

  it('blocks map edges and solid stations for the whole player body', () => {
    expect(isWalkable({ x: WALK_BOUNDS.left + 2, y: 180 })).toBe(false);
    expect(isWalkable({ x: WALK_BOUNDS.right - 22, y: WALK_BOUNDS.bottom - 8 })).toBe(false);
    expect(isWalkable({ x: 480, y: 284 })).toBe(false);
    expect(isWalkable({ x: 480, y: 0 })).toBe(false);
    expect(isWalkable({ x: 50, y: 0 })).toBe(false);
    expect(isWalkable({ x: Number.NaN, y: 400 })).toBe(false);
    for (const obstacle of MAP_OBSTACLES) {
      expect(isWalkable({ x: obstacle.x + obstacle.width / 2, y: obstacle.y + obstacle.height / 2 })).toBe(false);
    }
  });

  it('prevents a large movement step from crossing an obstacle', () => {
    const counterFront = RECEPTION_COUNTER_BOUNDS.y + RECEPTION_COUNTER_BOUNDS.height + PLAYER_HALF_HEIGHT;
    expect(moveWithinMap({ x: 480, y: 450 }, 'up', 1000)).toEqual({ x: 480, y: counterFront });
    expect(moveWithinMap({ x: 480, y: 450 }, 'right', 1000).x).toBeCloseTo(WALK_BOUNDS.right - PLAYER_HALF_WIDTH, 1);
    expect(moveWithinMap({ x: 480, y: 450 }, 'up', -1)).toEqual({ x: 480, y: 450 });
  });

  it('moves to the obstacle boundary instead of stopping a full step early', () => {
    const stopped = moveWithinMap({ x: 480, y: 190 }, 'down', 200);
    expect(stopped.y).toBeCloseTo(RECEPTION_COUNTER_BOUNDS.y - PLAYER_HALF_HEIGHT, 1);
    expect(isWalkable(stopped)).toBe(true);
    expect(isWalkable({ x: stopped.x, y: stopped.y + 0.1 })).toBe(false);
  });

  it('keeps the enlarged player silhouette clear of station sides', () => {
    expect(PLAYER_HALF_WIDTH).toBe(40);
    const machine = HEALING_MACHINE_FOOTPRINTS[0]!;
    const besideHealing = moveWithinMap({ x: 240, y: 0 }, 'left', 200);
    expect(besideHealing.x).toBeCloseTo(machine.x + machine.width + PLAYER_HALF_WIDTH, 1);
    expect(isWalkable(besideHealing)).toBe(true);
    expect(isWalkable({ x: besideHealing.x - 0.1, y: 0 })).toBe(false);
    const bench = WAITING_BENCHES[0]!;
    const besideWaiting = moveWithinMap({ x: 300, y: 527 }, 'left', 100);
    expect(besideWaiting.x).toBeCloseTo(bench.x + bench.width + PLAYER_HALF_WIDTH, 1);
    expect(isWalkable(besideWaiting)).toBe(true);
    expect(isWalkable({ x: besideWaiting.x - 0.1, y: 527 })).toBe(false);
  });
});
