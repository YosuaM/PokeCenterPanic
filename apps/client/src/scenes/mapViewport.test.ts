import { describe, expect, it } from 'vitest';
import { WALK_BOUNDS, MAP_OBSTACLES } from '@pokecenter/shared';
import { MAP_2D_SCALE, mapViewportPoint } from './mapViewport.js';
import { readFileSync } from 'node:fs';

describe('expanded clinic 2D viewport', () => {
  it('fits the complete clinic between the fixed HUD bands without changing server coordinates', () => {
    expect(mapViewportPoint({ x: 480, y: 270 })).toEqual({ x: 480, y: 270 });
    const top = mapViewportPoint({ x: WALK_BOUNDS.left, y: WALK_BOUNDS.top });
    const bottom = mapViewportPoint({ x: WALK_BOUNDS.right, y: WALK_BOUNDS.bottom });
    expect(top.x).toBeGreaterThan(0);
    expect(top.y).toBeGreaterThan(76);
    expect(bottom.x).toBeLessThan(960);
    expect(bottom.y).toBeLessThan(452);
    const svg = readFileSync('art/source/center-map.svg', 'utf8');
    expect(svg).toContain(`translate(480 270) scale(${MAP_2D_SCALE}) translate(-480 -270)`);
    for (const station of MAP_OBSTACLES) {
      const a = mapViewportPoint(station);
      const b = mapViewportPoint({ x: station.x + station.width, y: station.y + station.height });
      expect(b.x - a.x).toBeCloseTo(station.width * MAP_2D_SCALE);
      expect(b.y - a.y).toBeCloseTo(station.height * MAP_2D_SCALE);
    }
  });
});
