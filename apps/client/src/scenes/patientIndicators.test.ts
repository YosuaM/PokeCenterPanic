import { describe, expect, it } from 'vitest';
import { TREATMENT } from '@pokecenter/shared';
import { patientChecklistText } from './patientIndicators.js';

describe('patient treatment indicators', () => {
  it('shows every required treatment independently of completion order', () => {
    const requiredTreatments = TREATMENT.healing | TREATMENT.burnHeal;
    expect(patientChecklistText({ species: 'Pikachu', requiredTreatments,
      completedTreatments: TREATMENT.burnHeal }))
      .toBe('PIKACHU  ·  ANY ORDER  ·  HEAL TODO  ·  BURN DONE');
    expect(patientChecklistText({ species: 'Pikachu', requiredTreatments,
      completedTreatments: TREATMENT.healing }))
      .toBe('PIKACHU  ·  ANY ORDER  ·  HEAL DONE  ·  BURN TODO');
  });

  it('shows antidote and discharge readiness without depending on color', () => {
    expect(patientChecklistText({ species: 'Eevee', requiredTreatments: TREATMENT.antidote,
      completedTreatments: 0 })).toBe('EEVEE  ·  ANY ORDER  ·  POISON TODO');
    expect(patientChecklistText({ species: 'Eevee', requiredTreatments: TREATMENT.antidote,
      completedTreatments: TREATMENT.antidote }))
      .toBe('EEVEE  ·  ANY ORDER  ·  POISON DONE  ·  READY TO DISCHARGE');
  });
});
