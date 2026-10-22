import { patientPatienceRatio, type PatientRecord } from './patient.js';

export const ROUND_DURATION_MS = 360_000;
export const FINAL_CLEARANCE_MS = 30_000;
export const STREAK_BONUS_STEP = 10;
export const STREAK_BONUS_CAP = 50;

export interface ArrivalDifficulty {
  twoTreatmentChance: number;
  patienceMs: number;
}

export const ARRIVAL_DIFFICULTY_STAGES: readonly (ArrivalDifficulty & { untilMs: number })[] = [
  { untilMs: 120_000, twoTreatmentChance: 0.1, patienceMs: 90_000 },
  { untilMs: 240_000, twoTreatmentChance: 0.25, patienceMs: 80_000 },
  { untilMs: Infinity, twoTreatmentChance: 0.4, patienceMs: 70_000 },
];

export interface RoundResults {
  score: number;
  admitted: number;
  discharged: number;
  lost: number;
  unfinished: number;
  stars: number;
  bestStreak: number;
}

export interface RoundProgressSnapshot {
  remainingMs: number;
  score: number;
  streak: number;
  results: RoundResults | null;
}

/** Treatment mix and patience budget for a patient admitted at this round time. */
export function arrivalDifficulty(elapsedMs: number): ArrivalDifficulty {
  const time = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const { twoTreatmentChance, patienceMs } =
    ARRIVAL_DIFFICULTY_STAGES.find((stage) => time < stage.untilMs) ?? ARRIVAL_DIFFICULTY_STAGES.at(-1)!;
  return { twoTreatmentChance, patienceMs };
}

export function dischargePoints(patient: Pick<PatientRecord,
  'initialPatienceMs' | 'remainingPatienceMs'>): number {
  return 100 + Math.floor(50 * patientPatienceRatio(patient));
}

/** Extra points for the n-th consecutive discharge since the round start or the last loss. */
export function streakBonus(streak: number): number {
  if (!Number.isInteger(streak) || streak < 2) return 0;
  return Math.min(STREAK_BONUS_CAP, STREAK_BONUS_STEP * (streak - 1));
}

export function roundResults(score: number, admitted: number, discharged: number, lost: number,
  bestStreak = 0): RoundResults {
  const ratio = admitted > 0 ? discharged / admitted : 0;
  return { score, admitted, discharged, lost, unfinished: admitted - discharged - lost,
    stars: ratio >= 0.9 ? 3 : ratio >= 0.7 ? 2 : ratio >= 0.5 ? 1 : 0, bestStreak };
}
