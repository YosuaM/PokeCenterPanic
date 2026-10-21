import { describe, expect, it } from 'vitest';
import { isValidTreatmentSet, patientPresentation, patientPatienceRatio, TREATMENT } from './patient.js';

describe('patient medical presentation', () => {
  it('weakens HP as patience drains and reaches zero on loss without adding new treatment requirements', () => {
    const patient = { requiredTreatments: TREATMENT.healing, completedTreatments: 0,
      lifecycle: 'active' as const, initialPatienceMs: 90000, remainingPatienceMs: 45000 };
    expect(patientPresentation(patient).hp).toBe(25);
    expect(patientPresentation({ ...patient, remainingPatienceMs: 1 }).hp).toBe(1);
    expect(patientPresentation({ ...patient, completedTreatments: 1 })).toMatchObject({ hp: 50, readyForDischarge: true });
    expect(patientPresentation({ ...patient, lifecycle: 'lost', remainingPatienceMs: 0 }))
      .toMatchObject({ hp: 0, readyForDischarge: false });
    expect(patientPatienceRatio({ initialPatienceMs: 0, remainingPatienceMs: 100 })).toBe(0);
    expect(patientPatienceRatio({ initialPatienceMs: 100, remainingPatienceMs: 200 })).toBe(1);
    expect(patientPatienceRatio({ initialPatienceMs: 100, remainingPatienceMs: -1 })).toBe(0);
  });
  it('accepts the MVP treatment combinations and rejects unsupported needs', () => {
    for (const required of [1, 2, 4, 3, 5]) expect(isValidTreatmentSet(required)).toBe(true);
    for (const required of [0, 6, 7, 8]) expect(isValidTreatmentSet(required)).toBe(false);
  });

  it('derives HP, status, and discharge readiness from pending treatments', () => {
    const requiredTreatments = TREATMENT.healing | TREATMENT.burnHeal;
    expect(patientPresentation({ requiredTreatments, completedTreatments: 0, lifecycle: 'active' }))
      .toEqual({ hp: 50, maxHp: 100, status: 'burned', readyForDischarge: false });
    expect(patientPresentation({ requiredTreatments, completedTreatments: TREATMENT.healing, lifecycle: 'active' }))
      .toEqual({ hp: 100, maxHp: 100, status: 'burned', readyForDischarge: false });
    expect(patientPresentation({ requiredTreatments, completedTreatments: requiredTreatments, lifecycle: 'active' }))
      .toEqual({ hp: 100, maxHp: 100, status: null, readyForDischarge: true });
    expect(patientPresentation({ requiredTreatments, completedTreatments: requiredTreatments, lifecycle: 'discharged' })
      .readyForDischarge).toBe(false);
  });
});
