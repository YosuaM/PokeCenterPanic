import { describe, expect, it } from 'vitest';
import { TREATMENT, isWalkable } from '@pokecenter/shared';
import { visualFixture } from './visualFixtures.js';

describe('visual QA fixtures', () => {
  it('covers every condition, completion, rejection, and progress state', () => {
    expect(visualFixture('heal')?.patients[0]?.requiredTreatments).toBe(TREATMENT.healing);
    expect(visualFixture('burn')?.patients[0]?.requiredTreatments).toBe(TREATMENT.burnHeal);
    expect(visualFixture('poison')?.patients[0]?.requiredTreatments).toBe(TREATMENT.antidote);
    expect(visualFixture('ready')?.patients[0]?.completedTreatments).toBe(
      TREATMENT.healing | TREATMENT.antidote);
    expect(visualFixture('rejected')?.result).toMatchObject({ ok: false });
    expect(visualFixture('healing')?.machine).toMatchObject({ status: 'treating', remainingMs: 3_000 });
    expect(visualFixture('outage')?.machine).toMatchObject({ status: 'broken', remainingMs: 3_000 });
    expect(visualFixture('repair')?.machine).toMatchObject({ status: 'broken', repairRemainingMs: 1_000 });
    expect(visualFixture('preparing')?.medicineRemainingMs).toEqual([1_000, 0]);
  });
  it('keeps the six patient species and four distinguishable staff slots on valid stations', () => {
    const fixture = visualFixture('roster')!;
    expect(fixture.patients.map((patient) => patient.species)).toEqual(
      ['Pikachu', 'Bulbasaur', 'Charmander', 'Squirtle', 'Eevee', 'Psyduck']);
    expect(fixture.players.map((player) => player.slot)).toEqual([0, 1, 2, 3]);
    expect(new Set(fixture.players.map((player) => player.name)).size).toBe(4);
    expect(fixture.positions.every((position) => isWalkable(position))).toBe(true);
  });
  it('does not activate for an absent or unknown fixture', () => {
    expect(visualFixture(null)).toBeNull();
    expect(visualFixture('unknown')).toBeNull();
  });
});
