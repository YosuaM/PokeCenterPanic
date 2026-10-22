import { ROUND_DURATION_MS, roundResults } from '@pokecenter/shared';
import type { RoomMedicine } from './RoomMedicine.js';
import type { RoomMovement } from './RoomMovement.js';
import type { RoomPatients } from './RoomPatients.js';
import type { RoomIncidents } from './RoomIncidents.js';
import { RoundResultsState, type RoomState } from './RoomState.js';

export class RoomRound {
  private deadline = 0;
  private lastUpdatedAt = 0;

  constructor(private readonly state: RoomState, private readonly patients: RoomPatients,
    private readonly medicine: RoomMedicine, private readonly movement: RoomMovement,
    private readonly durationMs = ROUND_DURATION_MS, private readonly incidents?: RoomIncidents) {
    this.reset();
  }

  reset(): void {
    this.incidents?.reset();
    this.deadline = 0;
    this.lastUpdatedAt = 0;
    this.state.roundRemainingMs = this.durationMs;
    this.state.results = new RoundResultsState();
    Object.assign(this.state.results, roundResults(0, 0, 0, 0));
  }

  start(now: number): void {
    this.deadline = now + this.durationMs;
    this.lastUpdatedAt = now;
    this.state.roundRemainingMs = this.durationMs;
  }

  advance(now: number): void {
    if (this.state.phase !== 'running' || !this.deadline || !Number.isFinite(now) ||
      now < this.lastUpdatedAt) return;
    const ending = now >= this.deadline;
    const end = Math.min(now, this.deadline);
    // Split at repair/input boundaries so resumed healing uses only the remaining interval.
    do {
      const boundary = Math.max(this.lastUpdatedAt, this.incidents?.nextBoundary(end) ?? end);
      const exclusive = ending && boundary === this.deadline;
      this.patients.advance(boundary - this.lastUpdatedAt, exclusive);
      this.medicine.advance(boundary, (id) => this.movement.position(id),
        (id) => this.movement.facing(id), exclusive);
      this.incidents?.advance(boundary, (id) => this.movement.position(id),
        (id) => this.movement.facing(id), exclusive);
      this.lastUpdatedAt = boundary;
    } while (this.lastUpdatedAt < end);
    this.state.roundRemainingMs = Math.max(0, this.deadline - now);
    if (!ending) return;
    Object.assign(this.state.results, roundResults(this.state.score, this.state.admittedCount,
      this.state.dischargedCount, this.state.lostCount, this.state.bestStreak));
    this.patients.finishRound();
    this.incidents?.finishRound();
    this.medicine.reset();
    this.movement.stopAll();
    this.state.phase = 'results';
  }
}
