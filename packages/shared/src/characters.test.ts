import { describe, expect, it } from 'vitest';
import { ABILITY_DURATION_MS, CHARACTER_PROFILES, characterProfile, walkingSpeedMultiplier } from './characters.js';
import { PLAYER_CHARACTERS } from './index.js';
import { HEALING_DURATION_MS, REPAIR_DURATION_MS } from './patient.js';
import { MEDICINE_PREPARATION_MS } from './medicine.js';

describe('character profiles', () => {
  it('gives every selectable Pokémon one distinct role', () => {
    expect(Object.keys(CHARACTER_PROFILES).sort()).toEqual([...PLAYER_CHARACTERS].sort());
    expect(new Set(Object.values(CHARACTER_PROFILES).map((profile) => profile.role)).size).toBe(PLAYER_CHARACTERS.length);
  });

  it('only shortens or speeds up common tasks, so any team can finish every patient', () => {
    for (const profile of Object.values(CHARACTER_PROFILES)) {
      expect(profile.speed).toBeGreaterThanOrEqual(1);
      expect(profile.carryingSpeed).toBeGreaterThanOrEqual(1);
      expect(profile.healingMs).toBeLessThanOrEqual(HEALING_DURATION_MS);
      expect(profile.preparationMs).toBeLessThanOrEqual(MEDICINE_PREPARATION_MS);
      expect(profile.repairMs).toBeLessThanOrEqual(REPAIR_DURATION_MS);
    }
  });

  it('matches the specified specialties', () => {
    expect(CHARACTER_PROFILES.Chansey).toMatchObject({ role: 'nurse', healingMs: 2857, ability: 'softBoiled' });
    expect(CHARACTER_PROFILES.Audino).toMatchObject({ role: 'pharmacy', preparationMs: 1000, ability: 'calm' });
    expect(CHARACTER_PROFILES.Machoke).toMatchObject({ role: 'porter', carryingSpeed: 1.2, repairMs: 1000, ability: null });
    expect(CHARACTER_PROFILES.Meowth).toMatchObject({ role: 'allRounder', speed: 1.15, ability: null });
    expect(ABILITY_DURATION_MS).toEqual({ softBoiled: 3000, calm: 2000 });
  });

  it.each([
    ['Meowth', false, 1.15], ['Meowth', true, 1.15], ['Machoke', false, 1], ['Machoke', true, 1.2],
    ['Chansey', true, 1], ['', true, 1], [undefined, false, 1], ['Pikachu', true, 1], ['toString', true, 1],
  ] as const)('walks %s at %s carrying with a %s multiplier', (character, carrying, multiplier) => {
    expect(walkingSpeedMultiplier(character, carrying)).toBeCloseTo(multiplier);
  });

  it('falls back to baseline timings for unknown characters', () => {
    expect(characterProfile('toString')).toMatchObject({ healingMs: HEALING_DURATION_MS,
      preparationMs: MEDICINE_PREPARATION_MS, repairMs: REPAIR_DURATION_MS, ability: null });
  });
});
