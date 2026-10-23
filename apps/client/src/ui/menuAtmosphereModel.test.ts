import { CLOUD_ART_BANDS, cloudOffset as bandOffset } from './menuCloudsModel.js';
import { describe, expect, it } from 'vitest';
import { ART_WIDTH, ART_HEIGHT, CHIMNEY, SMOKE, SMOKE_COUNT, SMOKE_SECONDS,
  smokePuff, lightStrength } from './menuAtmosphereModel.js';

describe('layered menu motion', () => {
  it('crosses the entire screen at constant speed and repeats in the same direction', () => {
    for (const band of CLOUD_ART_BANDS) {
      const CLOUD_LOOP_SECONDS = band.loopSeconds;
      const cloudOffset = (time: number) => bandOffset(time, band.loopSeconds);
      expect(cloudOffset(0)).toBe(0);
      expect(cloudOffset(CLOUD_LOOP_SECONDS / 2)).toBeCloseTo(ART_WIDTH / 2);
      expect(cloudOffset(CLOUD_LOOP_SECONDS)).toBe(0);
      expect(cloudOffset(CLOUD_LOOP_SECONDS * 100)).toBe(0);
      for (const t of [-1, 0, 15, CLOUD_LOOP_SECONDS - .01, CLOUD_LOOP_SECONDS, 10000]) {
        const x = cloudOffset(t), next = cloudOffset(t + 1 / 30);
        expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(ART_WIDTH);
        expect((next - x + ART_WIDTH) % ART_WIDTH).toBeCloseTo(ART_WIDTH / CLOUD_LOOP_SECONDS / 30);
        expect(cloudOffset(t + CLOUD_LOOP_SECONDS)).toBeCloseTo(x);
        expect(x - ART_WIDTH).toBeLessThanOrEqual(0);
        expect(x + ART_WIDTH).toBeGreaterThanOrEqual(ART_WIDTH);
      }
    }
  });
  it('crops smoke within the canvas and includes its chimney anchor', () => {
    expect(SMOKE.x).toBeGreaterThanOrEqual(0); expect(SMOKE.y).toBeGreaterThanOrEqual(0);
    expect(SMOKE.x + SMOKE.width).toBeLessThanOrEqual(ART_WIDTH);
    expect(SMOKE.y + SMOKE.height).toBeLessThanOrEqual(ART_HEIGHT);
    expect(CHIMNEY.x).toBeGreaterThan(SMOKE.x);
    expect(CHIMNEY.x).toBeLessThan(SMOKE.x + SMOKE.width);
    expect(CHIMNEY.y).toBeLessThanOrEqual(SMOKE.y + SMOKE.height);
  });
  it('emits at the new chimney, rises, grows and fades to zero at both loop boundaries', () => {
    const birth = smokePuff(0, 0), middle = smokePuff(SMOKE_SECONDS / 2, 0);
    expect(birth).toMatchObject({ ...CHIMNEY, opacity: 0 });
    expect(middle.y).toBeLessThan(birth.y); expect(middle.x).toBeLessThan(birth.x);
    expect(middle.scale).toBeGreaterThan(birth.scale); expect(middle.opacity).toBeGreaterThan(.2);
    expect(smokePuff(SMOKE_SECONDS - .001, 0).opacity).toBeLessThan(.001);
    expect(smokePuff(SMOKE_SECONDS, 0)).toEqual(birth);
    for (let t = 0; t < SMOKE_SECONDS * 3; t += .1) {
      const puffs = Array.from({ length: SMOKE_COUNT }, (_, i) => smokePuff(t, i));
      expect(puffs.filter(puff => puff.opacity > .1).length).toBeGreaterThan(2);
      for (const puff of puffs) {
        expect(puff.opacity).toBeGreaterThanOrEqual(0); expect(puff.opacity).toBeLessThanOrEqual(.32);
      }
    }
  });
  it('keeps lamp shimmer restrained and continuous', () => {
    for (let t = 0; t < 100; t += .3) for (let i = 0; i < 8; i++) {
      expect(lightStrength(t, i)).toBeGreaterThan(.01);
      expect(lightStrength(t, i)).toBeLessThan(.18);
      expect(Math.abs(lightStrength(t, i) - lightStrength(t + .033, i))).toBeLessThan(.015);
    }
  });
});
