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
export const REPAIR_DURATION_MS = 2_000;
export const PATIENT_FAINT_DURATION_MS = 1_600;

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
  travelKind?: '' | 'arriving' | 'leaving' | 'fainting';
  travelElapsedMs?: number;
  faintX?: number;
  faintY?: number;
  faintElevation?: number;
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
  status: 'empty' | 'treating' | 'completed' | 'broken';
  remainingMs: number;
  repairOwnerId?: string;
  repairRemainingMs?: number;
}

export function isValidTreatmentSet(required: number): boolean {
  return required === TREATMENT.healing ||
    required === TREATMENT.burnHeal ||
    required === TREATMENT.antidote ||
    required === (TREATMENT.healing | TREATMENT.burnHeal) ||
    required === (TREATMENT.healing | TREATMENT.antidote);
}

export function patientPresentation(patient: Pick<PatientRecord,
  'requiredTreatments' | 'completedTreatments' | 'lifecycle'> &
  Partial<Pick<PatientRecord, 'initialPatienceMs' | 'remainingPatienceMs'>>): PatientPresentation {
  const pending = patient.requiredTreatments & ~patient.completedTreatments;
  const ratio = patientPatienceRatio(patient);
  return {
    hp: patient.lifecycle === 'lost' ? 0 : Math.ceil((pending & TREATMENT.healing ? 50 : 100) * ratio),
    maxHp: 100,
    status: pending & TREATMENT.burnHeal ? 'burned' : pending & TREATMENT.antidote ? 'poisoned' : null,
    readyForDischarge: patient.lifecycle === 'active' && pending === 0 && ratio > 0,
  };
}

export function patientPatienceRatio(patient: Partial<Pick<PatientRecord,
  'initialPatienceMs' | 'remainingPatienceMs'>>): number {
  if (patient.initialPatienceMs === undefined || patient.remainingPatienceMs === undefined) return 1;
  if (!Number.isFinite(patient.initialPatienceMs) || patient.initialPatienceMs <= 0 ||
    !Number.isFinite(patient.remainingPatienceMs)) return 0;
  return Math.min(1, Math.max(0, patient.remainingPatienceMs / patient.initialPatienceMs));
}
