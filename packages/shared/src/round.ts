import { patientPatienceRatio, type PatientRecord } from './patient.js';

export const ROUND_DURATION_MS = 360_000;
export const FINAL_CLEARANCE_MS = 30_000;

export interface RoundResults {
  score: number;
  admitted: number;
  discharged: number;
  lost: number;
  unfinished: number;
  stars: number;
}

export interface RoundProgressSnapshot {
  remainingMs: number;
  score: number;
  results: RoundResults | null;
}

export function dischargePoints(patient: Pick<PatientRecord,
  'initialPatienceMs' | 'remainingPatienceMs'>): number {
  return 100 + Math.floor(50 * patientPatienceRatio(patient));
}

export function roundResults(score: number, admitted: number, discharged: number, lost: number): RoundResults {
  const ratio = admitted > 0 ? discharged / admitted : 0;
  return { score, admitted, discharged, lost, unfinished: admitted - discharged - lost,
    stars: ratio >= 0.9 ? 3 : ratio >= 0.7 ? 2 : ratio >= 0.5 ? 1 : 0 };
}
