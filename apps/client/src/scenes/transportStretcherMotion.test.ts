import { describe, expect, it } from 'vitest';
import { TransportStretcherMotion } from './transportStretcherMotion.js';

describe('transport stretcher motion', () => {
  it('stays still at rest and eases into a small walking sway', () => {
    const motion = new TransportStretcherMotion();
    for (let time = 0; time <= 1000; time += 20) {
      expect(motion.update({ x: 100, y: 100 }, true, time)).toEqual({ lift: 0, roll: 0 });
    }
    const start = motion.update({ x: 101, y: 100 }, true, 1020);
    expect(start.roll).toBeGreaterThan(0);
    expect(start.roll).toBeLessThan(0.004);
    let peak = 0;
    let trough = 0;
    for (let frame = 2; frame <= 100; frame++) {
      const pose = motion.update({ x: 100 + frame, y: 100 }, true, 1000 + frame * 20);
      expect(pose.lift).toBeGreaterThanOrEqual(0);
      expect(pose.lift).toBeLessThanOrEqual(0.025);
      expect(Math.abs(pose.roll)).toBeLessThanOrEqual(0.018);
      peak = Math.max(peak, pose.roll);
      trough = Math.min(trough, pose.roll);
    }
    expect(peak).toBeGreaterThan(0.017);
    expect(trough).toBeLessThan(-0.017);
    for (let time = 3020; time <= 4000; time += 20) motion.update({ x: 200, y: 100 }, true, time);
    expect(motion.update({ x: 200, y: 100 }, true, 4020)).toEqual({ lift: 0, roll: 0 });
  });

  it('resets on placement, fresh pickup, teleport and interrupted frame clocks', () => {
    const motion = new TransportStretcherMotion();
    motion.update({ x: 0, y: 0 }, true, 0);
    expect(motion.update({ x: 2, y: 0 }, true, 20).roll).not.toBe(0);
    expect(motion.update({ x: 4, y: 0 }, false, 40)).toEqual({ lift: 0, roll: 0 });
    expect(motion.update({ x: 6, y: 0 }, true, 60)).toEqual({ lift: 0, roll: 0 });
    motion.update({ x: 8, y: 0 }, true, 80);
    expect(motion.update({ x: 400, y: 0 }, true, 100)).toEqual({ lift: 0, roll: 0 });
    motion.update({ x: 402, y: 0 }, true, 120);
    expect(motion.update({ x: 404, y: 0 }, true, 2000)).toEqual({ lift: 0, roll: 0 });
    motion.update({ x: 406, y: 0 }, true, 2020);
    expect(motion.update({ x: 408, y: 0 }, true, 10)).toEqual({ lift: 0, roll: 0 });
  });

  it('is independent of frame rate and patient instances', () => {
    const atRate = (fps: number) => {
      const motion = new TransportStretcherMotion();
      let pose = motion.update({ x: 0, y: 0 }, true, 0);
      for (let frame = 1; frame <= fps; frame++) {
        pose = motion.update({ x: frame * 100 / fps, y: 0 }, true, frame * 1000 / fps);
      }
      return pose;
    };
    for (const fps of [30, 120]) {
      expect(atRate(fps).roll).toBeCloseTo(atRate(60).roll, 8);
      expect(atRate(fps).lift).toBeCloseTo(atRate(60).lift, 8);
    }
    const still = new TransportStretcherMotion();
    expect(still.update({ x: 100, y: 0 }, true, 1000)).toEqual({ lift: 0, roll: 0 });
  });
});
