import { HEALING_DURATION_MS, REPAIR_DURATION_MS } from './patient.js';
import { MEDICINE_PREPARATION_MS } from './medicine.js';
import type { PlayerCharacter } from './index.js';

export type CharacterAbility = 'softBoiled' | 'calm';
export type CharacterRole = 'nurse' | 'pharmacy' | 'porter' | 'allRounder';

export interface CharacterProfile {
  role: CharacterRole;
  /** Multiplies base walking speed at all times. */
  speed: number;
  /** Multiplies walking speed while carrying a patient (on top of `speed`). */
  carryingSpeed: number;
  healingMs: number;
  preparationMs: number;
  repairMs: number;
  ability: CharacterAbility | null;
}

export const SOFT_BOILED_MS = 3_000;
export const CALM_MS = 2_000;
export const CALM_PATIENCE_RATIO = 0.25;
export const ABILITY_DURATION_MS: Readonly<Record<CharacterAbility, number>> = {
  softBoiled: SOFT_BOILED_MS,
  calm: CALM_MS,
};

/** Specialties speed a team up; every task stays possible for every character. */
export const CHARACTER_PROFILES: Readonly<Record<PlayerCharacter, CharacterProfile>> = {
  Chansey: { role: 'nurse', speed: 1, carryingSpeed: 1, healingMs: Math.round(HEALING_DURATION_MS / 1.4),
    preparationMs: MEDICINE_PREPARATION_MS, repairMs: REPAIR_DURATION_MS, ability: 'softBoiled' },
  Audino: { role: 'pharmacy', speed: 1, carryingSpeed: 1, healingMs: HEALING_DURATION_MS,
    preparationMs: 1_000, repairMs: REPAIR_DURATION_MS, ability: 'calm' },
  Machoke: { role: 'porter', speed: 1, carryingSpeed: 1.2, healingMs: HEALING_DURATION_MS,
    preparationMs: MEDICINE_PREPARATION_MS, repairMs: 1_000, ability: null },
  Meowth: { role: 'allRounder', speed: 1.15, carryingSpeed: 1, healingMs: HEALING_DURATION_MS,
    preparationMs: MEDICINE_PREPARATION_MS, repairMs: REPAIR_DURATION_MS, ability: null },
};

const BASELINE: CharacterProfile = { role: 'allRounder', speed: 1, carryingSpeed: 1,
  healingMs: HEALING_DURATION_MS, preparationMs: MEDICINE_PREPARATION_MS, repairMs: REPAIR_DURATION_MS,
  ability: null };

export function characterProfile(character: string | undefined): CharacterProfile {
  return Object.hasOwn(CHARACTER_PROFILES, character ?? '') ?
    CHARACTER_PROFILES[character as PlayerCharacter] : BASELINE;
}

export function walkingSpeedMultiplier(character: string | undefined, carryingPatient: boolean): number {
  const profile = characterProfile(character);
  return profile.speed * (carryingPatient ? profile.carryingSpeed : 1);
}
