import { describe, expect, it } from 'vitest';
import { isWalkable, moveWithinMap, SPAWN_POINTS } from './map.js';

describe('prototype map collisions', () => {
  it('keeps all spawn points and the route between stations walkable', () => {
    for (const spawn of SPAWN_POINTS) expect(isWalkable(spawn)).toBe(true);
    expect(isWalkable({ x: 329, y: 340 })).toBe(true);
  });

  it('blocks map edges and solid stations for the whole player body', () => {
    expect(isWalkable({ x: 60, y: 180 })).toBe(false);
    expect(isWalkable({ x: 880, y: 470 })).toBe(false);
    expect(isWalkable({ x: 456, y: 250 })).toBe(false);
    expect(isWalkable({ x: 456, y: 155 })).toBe(false);
    expect(isWalkable({ x: Number.NaN, y: 400 })).toBe(false);
  });

  it('prevents a large movement step from crossing an obstacle', () => {
    expect(moveWithinMap({ x: 456, y: 422 }, 'up', 1000)).toEqual({ x: 456, y: 322 });
    expect(moveWithinMap({ x: 456, y: 422 }, 'right', 1000).x).toBeLessThan(638);
    expect(moveWithinMap({ x: 456, y: 422 }, 'up', -1)).toEqual({ x: 456, y: 422 });
  });
});
