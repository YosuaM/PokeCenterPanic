import { describe, expect, it } from 'vitest';
import { prepareFoliage } from './menuFoliage.js';
import { FOLIAGE, frondWeight, frondWind, borderWeight, type FoliageRegion } from './menuFoliageModel.js';
import { ART_WIDTH, ART_HEIGHT } from './menuAtmosphereModel.js';

const region: FoliageRegion = { name: 'synthetic-stems', x: 0, y: 0, width: 80, height: 80, fronds: [
  { root: [25,65], tip: [23,20], radius: 12, amplitude: 2 },
  { root: [52,66], tip: [55,25], radius: 10, amplitude: 1.8 },
] };
function fixture() {
  const data = new Uint8ClampedArray(80 * 80 * 4);
  for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) {
    data.set([x * 3, y * 3, (x + y) % 2 * 100, 255], (y * 80 + x) * 4);
  }
  return data;
}
const pixel = (data: Uint8ClampedArray, x: number, y: number) => data.slice((y * 80 + x) * 4, (y * 80 + x + 1) * 4);

describe('rooted foliage deformation', () => {
  it('pins attachment points and borders while bending tips more than the lower stem', () => {
    const f = region.fronds[0]!;
    expect(frondWeight(f, ...f.root)).toBe(0);
    expect(frondWeight(f, ...f.tip)).toBe(1);
    expect(frondWeight(f,24,40)).toBeLessThan(frondWeight(f,23,20));
    expect(frondWeight(f,25,68)).toBe(0);
    expect(frondWeight(f,55,20)).toBe(0);
    expect(borderWeight(region,0,20)).toBe(0);
    expect(borderWeight(region,79,20)).toBe(0);
    expect(borderWeight(region,20,79)).toBe(0);
  });
  it('preserves exact pixels outside masks and at every root, without holes or edge seams', () => {
    const source = fixture(); const layer = prepareFoliage(region, source,80);
    const output = new Uint8ClampedArray(source.length);
    for (const time of [0,1,2,4,8,20]) {
      layer.render(output,time);
      for (const [x,y] of [[25,65],[52,66],[0,20],[79,20],[20,0],[20,79],[72,35],[38,70]]) {
        expect(pixel(output,x!,y!)).toEqual(pixel(source,x!,y!));
      }
      for (let i = 3; i < output.length; i += 4) expect(output[i]).toBe(255);
    }
    expect(source).toEqual(fixture());
    expect(pixel(output,23,20)).not.toEqual(pixel(source,23,20));
  });
  it('responds continuously with independently phased tips and bounded displacement', () => {
    for (let time = 0; time < 60; time += .2) region.fronds.forEach((f,i) => {
      const now = frondWind(time,f,i), next = frondWind(time + 1/30,f,i);
      expect(Math.abs(now[0]) + Math.abs(now[2])).toBeLessThanOrEqual(f.amplitude * 1.2);
      expect(Math.abs(now[0] - next[0])).toBeLessThan(.1);
    });
    expect(frondWind(3,region.fronds[0]!,0)).not.toEqual(frondWind(3,region.fronds[1]!,1));
    const layer = prepareFoliage(region,fixture(),80);
    const a = new Uint8ClampedArray(80*80*4), b = new Uint8ClampedArray(a.length);
    layer.render(a,1); layer.render(b,3);
    expect(a).not.toEqual(b);
    layer.render(b,1); expect(a).toEqual(b);
  });
  it('makes each authored group visibly flex at menu scale without sharp frame jumps', () => {
    for (const r of FOLIAGE) {
      let largestTravel = 0;
      for (const [i, f] of r.fronds.entries()) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let t = 0; t < 20; t += 1/30) {
          const [x,y] = frondWind(t,f,i), next = frondWind(t + 1/30,f,i);
          minX = Math.min(minX,x); maxX = Math.max(maxX,x);
          minY = Math.min(minY,y); maxY = Math.max(maxY,y);
          expect(Math.hypot(next[0]-x,next[1]-y)).toBeLessThan(.4);
        }
        largestTravel = Math.max(largestTravel, Math.hypot(maxX-minX,maxY-minY));
        expect(f.amplitude).toBeLessThanOrEqual(f.radius * .42);
      }
      // Even a 1280px menu retains several screen pixels of peak-to-peak tip travel.
      expect(largestTravel * 1280 / ART_WIDTH).toBeGreaterThan(4);
    }
  });
  it('keeps authored masks away from architecture, fences, pots and the path', () => {
    const protectedPoints = [[226,239],[480,300],[320,620],[385,800],[835,783],[912,649],[18,240],[1650,480]];
    for (const r of FOLIAGE) {
      expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x+r.width).toBeLessThanOrEqual(ART_WIDTH); expect(r.y+r.height).toBeLessThanOrEqual(ART_HEIGHT);
      for (const [x,y] of protectedPoints) {
        const weight = borderWeight(r,x!,y!);
        for (const f of r.fronds) expect(weight * frondWeight(f,x!,y!)).toBe(0);
      }
    }
  });
});
