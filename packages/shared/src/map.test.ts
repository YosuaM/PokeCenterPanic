import { describe, expect, it } from 'vitest';
import { CLINIC_DIVIDER, CLINIC_CORRIDOR, MAP_OBSTACLES, WALK_BOUNDS, PLAYER_HALF_HEIGHT, DISCHARGE_INTERACTION_POINT, HEALING_INTERACTION_POINT, isWalkable,
  moveWithinMap, PLAYER_HALF_WIDTH, RECEPTION_INTERACTION_POINTS, RECOVERY_INTERACTION_POINT,
  SPAWN_POINTS, WAITING_INTERACTION_POINTS } from './map.js';
import { MEDICINE_DISPOSAL_POINT, MEDICINE_PREPARATION_POINTS,
  MEDICINE_SURFACE_POINTS } from './medicine.js';

describe('clinic map collisions', () => {
  it('expands usable space while separating public waiting from care behind reception', () => {
    const area = (WALK_BOUNDS.right - WALK_BOUNDS.left) * (WALK_BOUNDS.bottom - WALK_BOUNDS.top);
    expect(area).toBeGreaterThan(3 * 844 * 412);
    const counter = MAP_OBSTACLES[0]!;
    expect(CLINIC_DIVIDER.x + CLINIC_DIVIDER.width).toBe(counter.x);
    expect(WAITING_INTERACTION_POINTS.every((point) => point.y > counter.y + counter.height)).toBe(true);
    expect([HEALING_INTERACTION_POINT, RECOVERY_INTERACTION_POINT, ...MEDICINE_PREPARATION_POINTS]
      .every((point) => point.y < counter.y)).toBe(true);
    for (let y = 125; y <= 545; y += 4) expect(isWalkable({ x: CLINIC_CORRIDOR.x, y })).toBe(true);
    const blocked = moveWithinMap(SPAWN_POINTS[0]!, 'up', 1000);
    expect(blocked.y).toBeCloseTo(counter.y + counter.height + PLAYER_HALF_HEIGHT, 1);
    expect(moveWithinMap({ x: 0, y: 422 }, 'up', 1000).y).toBeCloseTo(blocked.y, 1);
  });
  it('keeps all spawn points and the route between stations walkable', () => {
    for (const spawn of SPAWN_POINTS) expect(isWalkable(spawn)).toBe(true);
    expect(isWalkable({ x: 329, y: 340 })).toBe(true);
  });

  it('keeps every station interaction point on walkable ground', () => {
    const points = [...RECEPTION_INTERACTION_POINTS, ...WAITING_INTERACTION_POINTS,
      RECOVERY_INTERACTION_POINT, HEALING_INTERACTION_POINT,
      DISCHARGE_INTERACTION_POINT, ...MEDICINE_PREPARATION_POINTS,
      MEDICINE_DISPOSAL_POINT, ...MEDICINE_SURFACE_POINTS];
    for (const point of points) expect(isWalkable(point), JSON.stringify(point)).toBe(true);
  });

  it('keeps every interaction point reachable from the entrance with the wider player body', () => {
    const targets = [...RECEPTION_INTERACTION_POINTS, ...WAITING_INTERACTION_POINTS,
      RECOVERY_INTERACTION_POINT, HEALING_INTERACTION_POINT,
      DISCHARGE_INTERACTION_POINT, ...MEDICINE_PREPARATION_POINTS,
      MEDICINE_DISPOSAL_POINT, ...MEDICINE_SURFACE_POINTS];
    const queue = [{ ...SPAWN_POINTS[0]! }];
    const visited = new Set([queue[0]!.x + ',' + queue[0]!.y]);
    for (let index = 0; index < queue.length; index += 1) {
      const point = queue[index]!;
      for (const [dx, dy] of [[8, 0], [-8, 0], [0, 8], [0, -8]]) {
        const next = { x: point.x + dx!, y: point.y + dy! };
        const key = next.x + ',' + next.y;
        if (visited.has(key) || !isWalkable(next)) continue;
        visited.add(key);
        queue.push(next);
      }
    }
    for (const target of targets) {
      expect(queue.some((point) => Math.hypot(point.x - target.x, point.y - target.y) < 8),
        JSON.stringify(target)).toBe(true);
    }
  });

  it('blocks map edges and solid stations for the whole player body', () => {
    expect(isWalkable({ x: WALK_BOUNDS.left + 2, y: 180 })).toBe(false);
    expect(isWalkable({ x: WALK_BOUNDS.right - 22, y: WALK_BOUNDS.bottom - 8 })).toBe(false);
    expect(isWalkable({ x: 456, y: 250 })).toBe(false);
    expect(isWalkable({ x: 456, y: 0 })).toBe(false);
    expect(isWalkable({ x: Number.NaN, y: 400 })).toBe(false);
  });

  it('prevents a large movement step from crossing an obstacle', () => {
    expect(moveWithinMap({ x: 456, y: 422 }, 'up', 1000)).toEqual({ x: 456, y: 332 });
    expect(moveWithinMap({ x: 456, y: 422 }, 'right', 1000).x).toBeCloseTo(WALK_BOUNDS.right - PLAYER_HALF_WIDTH, 1);
    expect(moveWithinMap({ x: 456, y: 422 }, 'up', -1)).toEqual({ x: 456, y: 422 });
  });

  it('moves to the obstacle boundary instead of stopping a full step early', () => {
    const stopped = moveWithinMap({ x: 456, y: 420 }, 'up', 200);
    expect(stopped.y).toBeCloseTo(332, 1);
    expect(isWalkable(stopped)).toBe(true);
    expect(isWalkable({ x: stopped.x, y: stopped.y - 0.1 })).toBe(false);
  });

  it('keeps the enlarged player silhouette clear of station sides', () => {
    expect(PLAYER_HALF_WIDTH).toBe(40);
    expect(HEALING_INTERACTION_POINT).toEqual({ x: 165, y: 33 });
    const besideHealing = moveWithinMap({ x: 180, y: 33 }, 'left', 100);
    expect(besideHealing.x).toBeCloseTo(117 + PLAYER_HALF_WIDTH, 1);
    expect(isWalkable(besideHealing)).toBe(true);
    expect(isWalkable({ x: besideHealing.x - 0.1, y: 33 })).toBe(false);
    const besideWaiting = moveWithinMap({ x: 370, y: 605 }, 'left', 100);
    expect(besideWaiting.x).toBeCloseTo(322 + PLAYER_HALF_WIDTH, 1);
    expect(isWalkable(besideWaiting)).toBe(true);
    expect(isWalkable({ x: besideWaiting.x - 0.1, y: 605 })).toBe(false);
  });
});
