import { TREATMENT, type PatientRecord } from '@pokecenter/shared';

const TREATMENT_LABELS = [
  [TREATMENT.healing, 'HEAL'],
  [TREATMENT.burnHeal, 'BURN'],
  [TREATMENT.antidote, 'POISON'],
] as const;

export function patientChecklistText(patient: Pick<PatientRecord,
  'species' | 'requiredTreatments' | 'completedTreatments'>): string {
  const entries = TREATMENT_LABELS.filter(([flag]) => patient.requiredTreatments & flag)
    .map(([flag, label]) => `${label} ${patient.completedTreatments & flag ? 'DONE' : 'TODO'}`);
  const ready = (patient.requiredTreatments & ~patient.completedTreatments) === 0;
  return `${patient.species.toUpperCase()}  ·  ANY ORDER  ·  ${entries.join('  ·  ')}` +
    (ready ? '  ·  READY TO DISCHARGE' : '');
}
