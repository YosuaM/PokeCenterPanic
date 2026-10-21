import { TREATMENT, patientPatienceRatio, patientPresentation, type PatientRecord } from '@pokecenter/shared';

const TREATMENT_LABELS = [
  [TREATMENT.healing, 'HEALING'],
  [TREATMENT.burnHeal, 'BURN HEAL'],
  [TREATMENT.antidote, 'ANTIDOTE'],
] as const;

export function patientChecklistText(patient: Pick<PatientRecord,
  'species' | 'requiredTreatments' | 'completedTreatments'>): string {
  const entries = TREATMENT_LABELS.filter(([flag]) =>
    patient.requiredTreatments & ~patient.completedTreatments & flag).map(([, label]) => label);
  return `${patient.species.toUpperCase()}\n${entries.length ? `NEEDS: ${entries.join(' · ')}` : 'ALL TREATMENTS COMPLETE'}`;
}

export function patientIndicatorState(patient: PatientRecord) {
  const presentation = patientPresentation(patient);
  const patience = patientPatienceRatio(patient);
  const pending = patient.requiredTreatments & ~patient.completedTreatments;
  return {
    hp: presentation.hp,
    patience,
    seconds: Number.isFinite(patient.remainingPatienceMs) ?
      Math.ceil(Math.max(0, patient.remainingPatienceMs) / 1000) : 0,
    critical: patience <= 0.25,
    warning: patience <= 0.5,
    ready: presentation.readyForDischarge,
    icons: ([
      [TREATMENT.healing, 'heal', '+'], [TREATMENT.burnHeal, 'burn', 'B'],
      [TREATMENT.antidote, 'poison', 'A'],
    ] as const).filter(([flag]) => pending & flag).map(([, icon, fallback]) => ({ icon, fallback })),
  };
}
