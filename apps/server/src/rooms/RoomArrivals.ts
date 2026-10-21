import { PATIENT_SPECIES, TREATMENT } from '@pokecenter/shared';
import type { RoomPatients } from './RoomPatients.js';
import type { RoomState } from './RoomState.js';

const STAGES = [
  { untilMs: 30_000, intervals: [18_000, 16_000, 14_000, 12_000], activeCaps: [4, 5, 6, 6] },
  { untilMs: 60_000, intervals: [14_000, 12_000, 10_000, 9_000], activeCaps: [6, 7, 8, 8] },
  { untilMs: Infinity, intervals: [10_000, 9_000, 8_000, 7_000], activeCaps: [8, 9, 10, 10] },
] as const;
const TREATMENTS = [TREATMENT.healing, TREATMENT.burnHeal, TREATMENT.antidote,
  TREATMENT.healing | TREATMENT.burnHeal, TREATMENT.healing | TREATMENT.antidote];

/** Admissions reserve a waiting seat before a patient starts walking inside. */
export class RoomArrivals {
  private elapsedMs = 0;
  private remainingMs = 5_000;
  private connectedCount: number | undefined;
  private admittedCount = 0;

  constructor(private readonly state: RoomState, private readonly patients: RoomPatients,
    private readonly random: () => number = Math.random) {}

  reset(): void {
    this.elapsedMs = 0;
    this.remainingMs = 5_000;
    this.connectedCount = undefined;
    this.admittedCount = 0;
  }

  advance(elapsedMs: number): void {
    if (this.state.phase !== 'running' || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return;
    this.elapsedMs += elapsedMs;
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
    const first = this.admittedCount === 0;
    const species = first ? 'Pikachu' : PATIENT_SPECIES[Math.floor(this.random() * PATIENT_SPECIES.length)]!;
    const treatments = first ? TREATMENT.healing : TREATMENTS[Math.floor(this.random() * TREATMENTS.length)]!;
    if (this.patients.admit(species, treatments, slot, 'waiting')) this.admittedCount += 1;
  }
}
