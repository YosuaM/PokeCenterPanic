import { describe, expect, it } from 'vitest';
import { isValidTreatmentSet, patientPresentation, TREATMENT } from './patient.js';

describe('patient medical presentation', () => {
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
