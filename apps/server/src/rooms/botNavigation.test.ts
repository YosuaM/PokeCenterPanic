import { describe, expect, it } from 'vitest';
import { DISCHARGE_INTERACTION_POINT, RECEPTION_COUNTER_BOUNDS, SPAWN_POINTS, isInteractionReachable, isWalkable, stationInteractionBounds } from '@pokecenter/shared';
import { distanceField, reachCells, steer, targetGeometry } from './botNavigation.js';

describe('bot navigation', () => {
  it('reaches discharge from both the lobby and the treatment side of the counter', () => {
    const cells = [...reachCells('discharge')].map((cell) => cell.split(',').map(Number) as [number, number]);
    expect(cells.some(([, y]) => y > RECEPTION_COUNTER_BOUNDS.y + RECEPTION_COUNTER_BOUNDS.height)).toBe(true);
    expect(cells.some(([, y]) => y < RECEPTION_COUNTER_BOUNDS.y)).toBe(true);
    for (const [x, y] of cells) {
      expect(isInteractionReachable({ x, y }, 'down', stationInteractionBounds('discharge')!)).toBe(true);
    }
    expect(targetGeometry('medicine:apply:waiting:3')).toEqual(stationInteractionBounds('waiting:3'));
    expect(targetGeometry('nowhere')).toBeUndefined();
    expect(reachCells('nowhere').size).toBe(0);
  });

  it('routes from the staff spawn to a lobby seat through walkable turning points', () => {
    const field = distanceField(SPAWN_POINTS[0]!);
    const goal = reachCells('waiting:0');
    const path = field.pathTo(goal)!;
    expect(path.length).toBeGreaterThan(1);
    expect(Number.isFinite(field.distanceTo(goal))).toBe(true);
    expect(path.every((point) => isWalkable(point))).toBe(true);
    for (let index = 1; index < path.length; index += 1) {
      const [from, to] = [path[index - 1]!, path[index]!];
      expect(from.x === to.x || from.y === to.y).toBe(true);
      const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) / 8;
      for (let step = 0; step <= steps; step += 1) {
        const t = steps ? step / steps : 0;
        expect(isWalkable({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t })).toBe(true);
      }
    }
    const last = path.at(-1)!;
    expect(goal.has(`${last.x},${last.y}`)).toBe(true);
    expect(distanceField({ x: Number.NaN, y: 0 }).pathTo(goal)).toBeUndefined();
  });

  it('steers along one axis at a time and treats a crossed waypoint as reached', () => {
    const path = [{ x: 100, y: 0 }, { x: 100, y: 50 }];
    expect(steer({ x: 0, y: 0 }, path)).toBe('right');
    expect(steer({ x: 97, y: 0 }, path)).toBe('down');
    expect(path).toEqual([{ x: 100, y: 50 }]);
    const crossed = [{ x: 100, y: 0 }, { x: 200, y: 0 }];
    expect(steer({ x: 106, y: 0 }, crossed, 'right')).toBe('right');
    expect(crossed).toEqual([{ x: 200, y: 0 }]);
    expect(steer({ x: 104, y: 0 }, [{ x: 100, y: 0 }, { x: 100, y: 50 }], 'right')).toBe('down');
    expect(steer({ x: 100, y: 52 }, [{ x: 100, y: 50 }])).toBeNull();
    expect(steer(DISCHARGE_INTERACTION_POINT, [])).toBeNull();
  });
});
