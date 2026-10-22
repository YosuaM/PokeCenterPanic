import { describe, expect, it } from 'vitest';
import { CHARACTER_PROFILES, HEALING_DURATION_MS, PLAYER_CHARACTERS } from '@pokecenter/shared';
import { ABILITY_NAME, CHARACTER_ROLE_TEXT } from './characterRoles.js';

describe('character role copy', () => {
  it('describes every Pokémon with numbers that match its gameplay profile', () => {
    const { Chansey, Audino, Machoke, Meowth } = CHARACTER_PROFILES;
    expect(CHARACTER_ROLE_TEXT.Chansey.perks).toContain(`${Math.round((HEALING_DURATION_MS / Chansey.healingMs - 1) * 100)}% faster`);
    expect(CHARACTER_ROLE_TEXT.Audino.perks).toContain(`${Audino.preparationMs / 1000} s`);
    expect(CHARACTER_ROLE_TEXT.Machoke.perks).toContain(`${Math.round((Machoke.carryingSpeed - 1) * 100)}% faster`);
    expect(CHARACTER_ROLE_TEXT.Machoke.perks).toContain(`${Machoke.repairMs / 1000} s`);
    expect(CHARACTER_ROLE_TEXT.Meowth.perks).toContain(`${Math.round((Meowth.speed - 1) * 100)}% faster`);
  });

  it('names each ability exactly where the Pokémon has one', () => {
    for (const character of PLAYER_CHARACTERS) {
      const ability = CHARACTER_PROFILES[character].ability;
      const perks = CHARACTER_ROLE_TEXT[character].perks;
      if (ability) expect(perks).toContain(`Q ${ABILITY_NAME[ability]}`);
      else expect(perks).not.toContain('Q ');
    }
  });
});
