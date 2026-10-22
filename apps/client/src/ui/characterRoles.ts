import type { CharacterAbility, PlayerCharacter } from '@pokecenter/shared';

/** Lobby copy for each Pokémon's specialty; numbers mirror CHARACTER_PROFILES. */
export const CHARACTER_ROLE_TEXT: Readonly<Record<PlayerCharacter, { title: string; perks: string }>> = {
  Chansey: { title: 'Nurse', perks: 'Machines heal 40% faster · Q Soft-Boiled heals in the seat' },
  Audino: { title: 'Pharmacy', perks: 'Mixes medicine in 1 s · Q Calm restores patience' },
  Machoke: { title: 'Porter', perks: 'Carries patients 20% faster · Repairs in 1 s' },
  Meowth: { title: 'All-rounder', perks: 'Walks 15% faster everywhere' },
};

export const ABILITY_NAME: Readonly<Record<CharacterAbility, string>> = {
  softBoiled: 'Soft-Boiled',
  calm: 'Calm',
};
