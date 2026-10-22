import { ABILITY_DURATION_MS, CALM_PATIENCE_RATIO, RECEPTION_INTERACTION_POINTS, RECOVERY_INTERACTION_POINT,
  TREATMENT, WAITING_INTERACTION_POINTS, characterProfile, isInteractionReachable, stationInteractionBounds,
  type CharacterAbility, type Direction, type PatientInteractionRequest, type PatientInteractionResult,
  type Point } from '@pokecenter/shared';
import type { PatientState, RoomState } from './RoomState.js';

interface AbilityHold {
  playerId: string;
  ability: CharacterAbility;
  patientId: string;
  targetId: string;
  location: string;
  slotIndex: number;
  startedAt: number;
  lastHeldAt: number;
}

const reject = (reason: string): PatientInteractionResult => ({ ok: false, reason });

/** Held character abilities on a stationary patient: Chansey's Soft-Boiled and Audino's Calm. */
export class RoomAbilities {
  private readonly holds = new Map<string, AbilityHold>();
  private readonly calmed = new Set<string>();
  private readonly releaseRequired = new Set<string>();

  constructor(private readonly state: RoomState) {}

  reset(): void {
    for (const playerId of [...this.holds.keys()]) this.cancel(playerId);
    this.calmed.clear();
    this.releaseRequired.clear();
  }

  finishRound(): void {
    for (const playerId of [...this.holds.keys()]) this.cancel(playerId);
  }

  isHolding(playerId: string): boolean { return this.holds.has(playerId); }

  requiresRelease(playerId: string): boolean { return this.releaseRequired.has(playerId); }

  start(playerId: string, request: PatientInteractionRequest, position: Point, facing: Direction,
    now: number, stationary: boolean): PatientInteractionResult {
    const player = this.state.players.get(playerId);
    if (this.state.phase !== 'running' || !player?.connected || !Number.isFinite(now)) {
      return reject('Ability unavailable');
    }
    const ability = characterProfile(player.character).ability;
    if (!ability) return reject('This Pokémon has no special ability');
    if (this.releaseRequired.has(playerId)) return reject('Release Q before using it again');
    if (player.carriedPatientId || player.carriedMedicineId) return reject('Hands must be empty');
    if (!stationary) return reject('Stop moving to use your ability');
    const target = this.patientAt(request.targetId);
    if (!target.point) return reject('Choose a seated patient');
    if (!isInteractionReachable(position, facing, stationInteractionBounds(request.targetId) ?? target.point)) {
      return reject('Target out of range');
    }
    const patient = target.patient;
    if (!patient || patient.id !== request.expectedOccupantId) return reject('Patient changed');
    if (patient.travelKind) return reject('Patient is still moving');
    if ([...this.holds.values()].some((hold) => hold.patientId === patient.id)) {
      return reject('Another staff member is caring for this patient');
    }
    if (ability === 'softBoiled' && (!(patient.requiredTreatments & TREATMENT.healing) ||
      (patient.completedTreatments & TREATMENT.healing))) return reject('Healing not needed');
    if (ability === 'calm' && (this.calmed.has(patient.id) ||
      patient.remainingPatienceMs >= patient.initialPatienceMs)) return reject('Patient is already calm');
    this.holds.set(playerId, { playerId, ability, patientId: patient.id, targetId: request.targetId,
      location: patient.location, slotIndex: patient.slotIndex, startedAt: now, lastHeldAt: now });
    this.releaseRequired.add(playerId);
    player.abilityPatientId = patient.id;
    player.abilityRemainingMs = ABILITY_DURATION_MS[ability];
    return { ok: true, reason: '' };
  }

  onInput(playerId: string, held: boolean, direction: Direction | null, now: number): void {
    if (!held) {
      this.cancel(playerId);
      this.releaseRequired.delete(playerId);
      return;
    }
    const hold = this.holds.get(playerId);
    if (!hold) return;
    if (direction) this.cancel(playerId);
    else hold.lastHeldAt = now;
  }

  advance(now: number, positionFor: (id: string) => Point | undefined,
    facingFor: (id: string) => Direction | undefined, exclusiveEnd = false): void {
    for (const hold of [...this.holds.values()]) {
      const player = this.state.players.get(hold.playerId);
      const patient = this.state.patients.get(hold.patientId);
      const position = positionFor(hold.playerId);
      const facing = facingFor(hold.playerId);
      const completesAt = hold.startedAt + ABILITY_DURATION_MS[hold.ability];
      const expiresAt = hold.lastHeldAt + 250;
      const completes = completesAt <= now && !(exclusiveEnd && completesAt === now);
      if (!player?.connected || !position || !facing || player.carriedPatientId || player.carriedMedicineId ||
        !patient || patient.lifecycle !== 'active' || patient.location !== hold.location ||
        patient.slotIndex !== hold.slotIndex ||
        !isInteractionReachable(position, facing, stationInteractionBounds(hold.targetId)!) ||
        (expiresAt <= now && (!completes || expiresAt <= completesAt))) {
        this.cancel(hold.playerId);
        continue;
      }
      player.abilityRemainingMs = Math.max(0, completesAt - now);
      if (!completes) continue;
      if (hold.ability === 'softBoiled') {
        patient.completedTreatments |= patient.requiredTreatments & TREATMENT.healing;
      } else {
        patient.remainingPatienceMs = Math.min(patient.initialPatienceMs,
          patient.remainingPatienceMs + CALM_PATIENCE_RATIO * patient.initialPatienceMs);
        this.calmed.add(patient.id);
      }
      this.cancel(hold.playerId);
    }
  }

  releasePlayer(playerId: string): void {
    this.cancel(playerId);
    this.releaseRequired.delete(playerId);
  }

  private cancel(playerId: string): void {
    if (!this.holds.delete(playerId)) return;
    const player = this.state.players.get(playerId);
    if (!player) return;
    player.abilityPatientId = '';
    player.abilityRemainingMs = 0;
  }

  private patientAt(targetId: string): { point?: Point; patient?: PatientState } {
    const slot = /^(reception|waiting):(0|[1-9]\d*)$/.exec(targetId);
    if (slot) {
      const index = Number(slot[2]);
      const point = (slot[1] === 'reception' ? RECEPTION_INTERACTION_POINTS : WAITING_INTERACTION_POINTS)[index];
      const slots = slot[1] === 'reception' ? this.state.receptionSlots : this.state.waitingSlots;
      const patient = this.state.patients.get(slots[index] ?? '');
      return { point, patient: patient?.lifecycle === 'active' && patient.location === slot[1] ? patient : undefined };
    }
    if (targetId !== 'recovery') return {};
    const patient = this.state.patients.get(this.state.recoveryQueue[0] ?? '');
    return { point: RECOVERY_INTERACTION_POINT,
      patient: patient?.lifecycle === 'active' && patient.location === 'recovery' ? patient : undefined };
  }
}
