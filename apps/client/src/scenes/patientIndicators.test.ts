import { describe, expect, it } from 'vitest';
import { TREATMENT, type PatientRecord } from '@pokecenter/shared';
import { patientChecklistText, patientIndicatorState } from './patientIndicators.js';

const patient: PatientRecord = { id: 'patient', species: 'Pikachu',
  requiredTreatments: TREATMENT.healing | TREATMENT.antidote, completedTreatments: 0,
  initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active',
  location: 'waiting', slotIndex: 0, carrierId: '' };

describe('patient treatment indicators', () => {
  it('shows every required treatment independently of completion order', () => {
    const requiredTreatments = TREATMENT.healing | TREATMENT.burnHeal;
    expect(patientChecklistText({ species: 'Pikachu', requiredTreatments,
      completedTreatments: TREATMENT.burnHeal }))
      .toBe('PIKACHU\nNEEDS: HEALING');
    expect(patientChecklistText({ species: 'Pikachu', requiredTreatments,
      completedTreatments: TREATMENT.healing }))
      .toBe('PIKACHU\nNEEDS: BURN HEAL');
  });

  it('shows antidote and discharge readiness without depending on color', () => {
    expect(patientChecklistText({ species: 'Eevee', requiredTreatments: TREATMENT.antidote,
      completedTreatments: 0 })).toBe('EEVEE\nNEEDS: ANTIDOTE');
    expect(patientChecklistText({ species: 'Eevee', requiredTreatments: TREATMENT.antidote,
      completedTreatments: TREATMENT.antidote }))
      .toBe('EEVEE\nALL TREATMENTS COMPLETE');
  });

  it('shows only pending care in text and symbols after either treatment finishes', () => {
    expect(patientIndicatorState(patient).icons).toEqual([
      { icon: 'heal', fallback: '+' }, { icon: 'poison', fallback: 'A' },
    ]);
    const healed = { ...patient, completedTreatments: TREATMENT.healing };
    expect(patientIndicatorState(healed)).toMatchObject({ hp: 100, ready: false,
      icons: [{ icon: 'poison', fallback: 'A' }] });
    expect(patientChecklistText(healed)).toBe('PIKACHU\nNEEDS: ANTIDOTE');
    expect(patientIndicatorState({ ...patient, completedTreatments: TREATMENT.antidote }).icons)
      .toEqual([{ icon: 'heal', fallback: '+' }]);
  });

  it.each([
    [45_001, false, false], [45_000, true, false],
    [22_501, true, false], [22_500, true, true],
  ])('marks warning and critical boundaries immediately at %s ms', (remainingPatienceMs, warning, critical) => {
    expect(patientIndicatorState({ ...patient, remainingPatienceMs })).toMatchObject({ warning, critical });
  });

  it('distinguishes completed care from a safe discharge as patience expires', () => {
    const complete = { ...patient, completedTreatments: patient.requiredTreatments,
      remainingPatienceMs: 9_000 };
    expect(patientIndicatorState(complete)).toMatchObject({ ready: true, critical: true,
      hp: 10, patience: 0.1, seconds: 9, icons: [] });
    expect(patientIndicatorState({ ...complete, remainingPatienceMs: 0 }))
      .toMatchObject({ ready: false, hp: 0, patience: 0, seconds: 0 });
    expect(patientIndicatorState({ ...complete, lifecycle: 'lost' })).toMatchObject({ ready: false, hp: 0 });
  });

  it('clamps depleted and overfilled patience and rejects non-finite time', () => {
    expect(patientIndicatorState({ ...patient, remainingPatienceMs: -50 }))
      .toMatchObject({ seconds: 0, patience: 0, hp: 0 });
    expect(patientIndicatorState({ ...patient, remainingPatienceMs: 180_000 }))
      .toMatchObject({ patience: 1, hp: 50 });
    expect(patientIndicatorState({ ...patient, initialPatienceMs: 0 }))
      .toMatchObject({ patience: 0, hp: 0 });
    expect(patientIndicatorState({ ...patient, remainingPatienceMs: NaN }))
      .toMatchObject({ seconds: 0, patience: 0, hp: 0 });
  });
});
