export const PATIENT_SPECIES = [
  'Pikachu', 'Bulbasaur', 'Charmander', 'Squirtle', 'Eevee', 'Psyduck',
] as const;

export type PatientSpecies = (typeof PATIENT_SPECIES)[number];
export type PatientLifecycle = 'active' | 'discharged' | 'lost' | 'unfinished';
export type PatientLocation = 'reception' | 'waiting' | 'carrier' | 'healingMachine' | 'recovery' | 'none';

export const TREATMENT = {
  healing: 1,
  burnHeal: 2,
  antidote: 4,
} as const;

export const HEALING_DURATION_MS = 4_000;

export interface PatientRecord {
  id: string;
  species: PatientSpecies;
  requiredTreatments: number;
  completedTreatments: number;
  initialPatienceMs: number;
  remainingPatienceMs: number;
  lifecycle: PatientLifecycle;
  location: PatientLocation;
  slotIndex: number;
  carrierId: string;
}

export interface PatientPresentation {
  hp: number;
  maxHp: 100;
  status: 'burned' | 'poisoned' | null;
  readyForDischarge: boolean;
}

export interface PatientInteractionRequest {
  targetId: string;
  expectedOccupantId: string;
}

export interface PatientInteractionResult {
  ok: boolean;
  reason: string;
}

export interface HealingMachineSnapshot {
  patientId: string;
  status: 'empty' | 'treating' | 'completed';
  remainingMs: number;
}

export function isValidTreatmentSet(required: number): boolean {
  return required === TREATMENT.healing ||
    required === TREATMENT.burnHeal ||
    required === TREATMENT.antidote ||
    required === (TREATMENT.healing | TREATMENT.burnHeal) ||
    required === (TREATMENT.healing | TREATMENT.antidote);
}

export function patientPresentation(patient: Pick<PatientRecord,
  'requiredTreatments' | 'completedTreatments' | 'lifecycle'>): PatientPresentation {
  const pending = patient.requiredTreatments & ~patient.completedTreatments;
  return {
    hp: pending & TREATMENT.healing ? 50 : 100,
    maxHp: 100,
    status: pending & TREATMENT.burnHeal ? 'burned' : pending & TREATMENT.antidote ? 'poisoned' : null,
    readyForDischarge: patient.lifecycle === 'active' && pending === 0,
  };
}
