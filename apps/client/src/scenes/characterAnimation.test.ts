import { describe, expect, it } from 'vitest';
import type { SpeciesSprite } from '../sprites/pmd.js';
import { SEATED_IDLE_REST_MS, animationFrame, characterAnimation, seatedIdleFrame, spriteWorldSize,
  stretcherLyingScale } from './center3dView.js';

// 60 ticks = 1 s per frame keeps the arithmetic readable.
const idle = { durations: [60, 60, 60] };

describe('character animation frames', () => {
  it('loops through PMD frame durations, including negative clocks', () => {
    expect([0, 999, 1000, 2500, 3000, -500].map((time) => animationFrame(idle, time))).toEqual([0, 0, 1, 2, 0, 2]);
  });

  it('holds seated patients on their first frame between occasional idle loops', () => {
    const frames = Array.from({ length: 200 }, (_, step) => seatedIdleFrame(idle, step * 100, 'patient-1'));
    const moving = frames.filter((frame) => frame !== 0).length;
    expect(moving).toBeGreaterThan(0);
    // One three-second loop per cycle of at least eight seconds leaves at most a quarter of frames animated.
    expect(moving / frames.length).toBeLessThan(0.25);
    const restStart = frames.lastIndexOf(2) + 1;
    expect(frames.slice(restStart, restStart + SEATED_IDLE_REST_MS / 100 - 1).every((frame) => frame === 0)).toBe(true);
  });

  it('staggers neighbours so a full waiting room never fidgets in unison', () => {
    const timeline = (id: string) => Array.from({ length: 300 }, (_, step) => seatedIdleFrame(idle, step * 100, id));
    expect(timeline('patient-1')).not.toEqual(timeline('patient-2'));
    expect(timeline('patient-1')).toEqual(timeline('patient-1'));
    expect(seatedIdleFrame(idle, -1, 'patient-1')).toBe(seatedIdleFrame(idle, 0, 'patient-1'));
  });

  it('lies carried patients down, walks while moving and otherwise idles, skipping missing sheets', () => {
    const sheet = (image: string) => ({ frameWidth: 24, frameHeight: 24, durations: [12], directions: 8, image });
    const species: SpeciesSprite = { id: '0025', name: 'Pikachu', credits: 'Artist', idle: sheet('idle'),
      walk: sheet('walk'), laying: sheet('laying') };
    const all = () => true;
    expect(characterAnimation(species, all, false, true)?.image).toBe('laying');
    expect(characterAnimation(species, all, true, true)?.image).toBe('laying');
    expect(characterAnimation(species, all, true, false)?.image).toBe('walk');
    expect(characterAnimation(species, all, false, false)?.image).toBe('idle');
    expect(characterAnimation(species, (image) => image !== 'laying', false, true)?.image).toBe('idle');
    expect(characterAnimation({ ...species, laying: undefined }, all, true, true)?.image).toBe('walk');
    expect(characterAnimation(undefined, all, false, true)).toBeUndefined();
  });

  it('shrinks lying patients to fit the mattress, wide poses the most', () => {
    expect(stretcherLyingScale(24)).toBe(0.85);
    expect(spriteWorldSize(40, 1).width * stretcherLyingScale(40)).toBeCloseTo(1.45);
    expect(stretcherLyingScale(40)).toBeLessThan(stretcherLyingScale(24));
  });
});
