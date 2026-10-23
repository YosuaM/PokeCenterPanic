import { describe, expect, it } from 'vitest';
import { createTreeWind, FOREGROUND_TREE_WIND, REAR_TREE_WIND, TREE_WIND_SPEED } from './menuTreeWind.js';
import { ART_HEIGHT, ART_WIDTH } from './menuAtmosphereModel.js';
import { frondWind, frondWeight, type FoliageRegion } from './menuFoliageModel.js';

describe('subtle tree wind', () => {
  it('replaces moving silhouettes from the original texture without ghosting or accumulated drift', () => {
    const width = 80, height = 80;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 15; y <= 65; y++) for (let x = 18; x <= 28; x++) {
      data.set([20, 45, 70, 255], (y * width + x) * 4);
    }
    const original = data.slice();
    const region: FoliageRegion = { name: 'branch', x: 0, y: 0, width, height,
      fronds: [{ root: [23, 65], tip: [23, 20], radius: 14, amplitude: 2.2 }] };
    let output = new Uint8ClampedArray(data.length);
    const context = {
      createImageData: () => ({ data: new Uint8ClampedArray(data.length) }),
      putImageData: (image: ImageData, x: number, y: number) => {
        expect([x, y]).toEqual([0, 0]); output = new Uint8ClampedArray(image.data);
      },
    } as unknown as CanvasRenderingContext2D;
    const update = createTreeWind(context, { width, height, data } as ImageData, [region]);
    const pixel = (pixels: Uint8ClampedArray, x: number, y: number) =>
      pixels.slice((y * width + x) * 4, (y * width + x + 1) * 4);
    update(2); const first = output.slice();
    update(7); expect(output).not.toEqual(first);
    for (const time of [0, 2, 7, 15, 60]) {
      update(time);
      for (const [x, y] of [[23, 65], [23, 60], [0, 20], [79, 20], [20, 0], [20, 79], [50, 30]]) {
        expect(pixel(output, x!, y!)).toEqual(pixel(original, x!, y!));
      }
      expect(pixel(output, 23, 20)[3]).toBe(255);
    }
    update(2); expect(output).toEqual(first); expect(data).toEqual(original);
    expect([...first].some((value, i) => i % 4 === 3 && value < original[i]!)).toBe(true);
    expect([...first].some((value, i) => i % 4 === 3 && value > original[i]!)).toBe(true);
  });

  it('keeps authored patches disjoint, inside the artwork, with gentle continuous motion and pinned roots', () => {
    for (const regions of [REAR_TREE_WIND, FOREGROUND_TREE_WIND]) {
      for (const [index, region] of regions.entries()) {
        expect(region.x).toBeGreaterThanOrEqual(0); expect(region.y).toBeGreaterThanOrEqual(0);
        expect(region.x + region.width).toBeLessThanOrEqual(ART_WIDTH);
        expect(region.y + region.height).toBeLessThanOrEqual(ART_HEIGHT);
        for (const other of regions.slice(index + 1)) {
          expect(region.x + region.width <= other.x || other.x + other.width <= region.x ||
            region.y + region.height <= other.y || other.y + other.height <= region.y).toBe(true);
        }
        for (const [i, branch] of region.fronds.entries()) {
          expect(frondWeight(branch, ...branch.root)).toBe(0);
          let travel = 0;
          for (let time = 0; time < 30; time += .25) {
            const now = frondWind(time * TREE_WIND_SPEED, branch, i), next = frondWind((time + 1 / 30) * TREE_WIND_SPEED, branch, i);
            travel = Math.max(travel, Math.hypot(now[0], now[1]));
            expect(Math.hypot(now[0], now[1]) + Math.abs(now[2])).toBeLessThan(12);
            expect(Math.hypot(next[0] - now[0], next[1] - now[1])).toBeLessThan(.5);
          }
          expect(travel).toBeGreaterThan(2);
          const positions = Array.from({ length: 361 }, (_, frame) =>
            frondWind(frame / 30 * TREE_WIND_SPEED, branch, i));
          const span = (axis: 0 | 1) => Math.max(...positions.map(p => p[axis])) - Math.min(...positions.map(p => p[axis]));
          // A 600px-high menu must retain visible travel after the artwork is scaled down.
          expect(Math.hypot(span(0), span(1)) * 600 / ART_HEIGHT).toBeGreaterThan(4);
        }
      }
    }
  });
});
