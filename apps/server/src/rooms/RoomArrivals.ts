import { FINAL_CLEARANCE_MS, PATIENT_SPECIES, ROUND_DURATION_MS, TREATMENT, arrivalDifficulty,
  type PatientSpecies } from '@pokecenter/shared';
import type { RoomPatients } from './RoomPatients.js';
import type { RoomState } from './RoomState.js';

const STAGES = [
  { untilMs: 30_000, intervals: [18_000, 16_000, 14_000, 12_000], activeCaps: [4, 5, 6, 6] },
  { untilMs: 60_000, intervals: [14_000, 12_000, 10_000, 9_000], activeCaps: [6, 7, 8, 8] },
  { untilMs: Infinity, intervals: [10_000, 9_000, 8_000, 7_000], activeCaps: [8, 9, 10, 10] },
] as const;
const SINGLE_TREATMENTS = [TREATMENT.healing, TREATMENT.burnHeal, TREATMENT.antidote];
const DOUBLE_TREATMENTS = [TREATMENT.healing | TREATMENT.burnHeal, TREATMENT.healing | TREATMENT.antidote];
/** Introduces each station once before random admissions begin. */
export const GUIDED_OPENING: readonly { species: PatientSpecies; treatments: number }[] = [
  { species: 'Pikachu', treatments: TREATMENT.healing },
  { species: 'Charmander', treatments: TREATMENT.burnHeal },
  { species: 'Bulbasaur', treatments: TREATMENT.antidote },
  { species: 'Squirtle', treatments: TREATMENT.healing | TREATMENT.burnHeal },
];

/** Admissions reserve a waiting seat before a patient starts walking inside. */
export class RoomArrivals {
  private elapsedMs = 0;
  private remainingMs = 5_000;
  private connectedCount: number | undefined;
  private admittedCount = 0;

  constructor(private readonly state: RoomState, private readonly patients: RoomPatients,
    private readonly random: () => number = Math.random, private readonly durationMs = ROUND_DURATION_MS) {}

  reset(): void {
    this.elapsedMs = 0;
    this.remainingMs = 5_000;
    this.connectedCount = undefined;
    this.admittedCount = 0;
  }

  advance(elapsedMs: number, roundElapsedMs = this.elapsedMs + elapsedMs): void {
    if (this.state.phase !== 'running' || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return;
    this.elapsedMs = roundElapsedMs;
    if (this.elapsedMs >= Math.max(0, this.durationMs - FINAL_CLEARANCE_MS)) return;
    const stage = STAGES.find((candidate) => this.elapsedMs < candidate.untilMs)!;
    const connected = Math.min(4, [...this.state.players.values()].filter((player) => player.connected).length);
    const interval = connected ? stage.intervals[connected - 1]! : 0;
    if (this.connectedCount !== undefined && connected !== this.connectedCount) {
      this.connectedCount = connected;
      this.remainingMs = interval;
      return;
    }
    this.connectedCount = connected;
    if (!connected) return;
    this.remainingMs -= elapsedMs;
    if (this.remainingMs > 0) return;
    // Skip saturation and missed intervals; never replay a backlog after a stall.
    this.remainingMs = interval;
    const slot = [...this.state.waitingSlots].findIndex((id) => !id);
    const population = [...this.state.patients.values()].filter((patient) => patient.lifecycle === 'active').length;
    if (slot < 0 || population >= stage.activeCaps[connected - 1]!) return;
    const { species, treatments } = GUIDED_OPENING[this.admittedCount] ?? this.randomPatient();
    if (this.patients.admit(species, treatments, slot, 'waiting',
      arrivalDifficulty(this.elapsedMs).patienceMs)) this.admittedCount += 1;
  }

  private randomPatient(): { species: PatientSpecies; treatments: number } {
    const species = pick(PATIENT_SPECIES, this.random());
    const pool = this.random() < arrivalDifficulty(this.elapsedMs).twoTreatmentChance ?
      DOUBLE_TREATMENTS : SINGLE_TREATMENTS;
    return { species, treatments: pick(pool, this.random()) };
  }
}

function pick<T>(values: readonly T[], sample: number): T {
  const index = Math.floor(sample * values.length);
  return values[Math.min(values.length - 1, Math.max(0, Number.isFinite(index) ? index : 0))]!;
}
