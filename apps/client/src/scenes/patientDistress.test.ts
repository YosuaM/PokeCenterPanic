import { describe, expect, it } from 'vitest';
import { patientDistress } from './patientDistress.js';

describe('patient distress visuals', () => {
  it('distinguishes healthy, warning and critical patience without hiding active patients', () => {
    expect(patientDistress(1, 100)).toMatchObject({ tint: 0xffffff, opacity: 1, roll: 0, drop: 0 });
    expect(patientDistress(0.5, 100)).toMatchObject({ tint: 0xffd79c, roll: 0 });
    expect(patientDistress(0.25, 100)).toMatchObject({ tint: 0xffa3a3, opacity: 1, drop: 0.06 });
    expect(patientDistress(0.1, 100).roll).not.toBe(patientDistress(0.1, 300).roll);
  });

  it('collapses before fading and clamps the faint effect at both endpoints', () => {
    expect(patientDistress(0, 0, -1)).toMatchObject({ roll: -0, opacity: 1 });
    expect(patientDistress(0, 0, 0.35)).toMatchObject({ roll: -Math.PI / 2, opacity: 1 });
    expect(patientDistress(0, 0, 0.7).opacity).toBeCloseTo(0.5);
    expect(patientDistress(0, 0, 2)).toMatchObject({ roll: -Math.PI / 2, opacity: 0 });
    expect(patientDistress(1, 100)).toMatchObject({ opacity: 1, roll: 0, tint: 0xffffff });
  });
});
