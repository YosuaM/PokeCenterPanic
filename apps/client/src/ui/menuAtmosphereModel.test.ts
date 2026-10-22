import { describe, expect, it } from 'vitest';
import { ART_WIDTH, ART_HEIGHT, CLOUDS, SMOKE, cloudPixel, smokePixel,
  skyOccluder, inSky, cloudBandWeight, cloudOffset, smokePuff, lightStrength } from './menuAtmosphereModel.js';

describe('original menu atmosphere motion', () => {
  it('keeps every source region inside the original artwork', () => {
    for (const r of [...CLOUDS, SMOKE]) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(ART_WIDTH);
      expect(r.y + r.height).toBeLessThanOrEqual(ART_HEIGHT);
    }

  });
  it('extracts clouds and smoke without selecting dark trees or unchanged pixels', () => {
    expect(cloudPixel([125, 95, 178], [35, 55, 165])).toBe(true);
    expect(cloudPixel([35, 55, 165], [35, 55, 165])).toBe(false);
    expect(cloudPixel([20, 32, 65], [10, 20, 50])).toBe(false);
    expect(smokePixel([130, 118, 160], [20, 30, 60])).toBe(true);
    expect(smokePixel([140, 85, 178], [20, 30, 60])).toBe(false);
    expect(smokePixel([20, 32, 65], [10, 20, 50])).toBe(false);
    expect(skyOccluder([20, 30, 65])).toBe(true);
    expect(skyOccluder([245, 245, 255])).toBe(true);
    expect(skyOccluder([40, 55, 170])).toBe(false);
  });
  it('starts cloud layers in place and bounds their independent drift', () => {
    for (let i = 0; i < 3; i++) {
      expect(cloudOffset(0, i)).toBe(0);
      expect(Math.abs(cloudOffset(8, i))).toBeGreaterThan(1);
    }
    for (let t = 0; t < 300; t += .25) {
      CLOUDS.forEach((_, i) => expect(Math.abs(cloudOffset(t, i))).toBeLessThanOrEqual(76));
    }
  });
  it('covers every sky band continuously and excludes the roof and mountains', () => {
    for (let y = 0; y < 400; y++) {
      const sum = CLOUDS.reduce((total, r, i) => total + (y >= r.y && y < r.y+r.height ? cloudBandWeight(y,i) : 0),0);
      expect(sum).toBeCloseTo(1);
    }
    for (const [x,y] of [[50,40],[600,190],[900,240],[1160,320],[1360,280]]) expect(inSky(x!,y!)).toBe(true);
    for (const [x,y] of [[500,240],[780,295],[1010,330],[1300,410]]) expect(inSky(x!,y!)).toBe(false);
    expect(Math.abs(cloudOffset(3,0))).toBeGreaterThan(7);
    expect(Math.abs(cloudOffset(40,0)-cloudOffset(40,2))).toBeLessThan(8);
  });
  it('emits smoke at the chimney, rises, expands, fades and loops without a pop', () => {
    const birth = smokePuff(0, 0), middle = smokePuff(5, 0), end = smokePuff(9.999, 0);
    expect(birth).toMatchObject({ x: 226, y: 218, opacity: 0 });
    expect(middle.y).toBeLessThan(birth.y);
    expect(middle.scale).toBeGreaterThan(birth.scale);
    expect(middle.opacity).toBeGreaterThan(0);
    expect(end.opacity).toBeLessThan(.001);
    expect(smokePuff(10, 0)).toEqual(birth);
    expect(smokePuff(0, 1).y).not.toBe(birth.y);
  });
  it('keeps light shimmer gentle, continuous and independently phased', () => {
    for (let t = 0; t < 100; t += .3) for (let i = 0; i < 8; i++) {
      expect(lightStrength(t, i)).toBeGreaterThan(.01);
      expect(lightStrength(t, i)).toBeLessThan(.18);
      expect(Math.abs(lightStrength(t, i) - lightStrength(t + .033, i))).toBeLessThan(.015);
    }
    expect(lightStrength(3, 0)).not.toBe(lightStrength(3, 1));
  });
});
