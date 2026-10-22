import type { PatientInteractionResult, PlayerInput } from '@pokecenter/shared';
import type { RoomAbilities } from './RoomAbilities.js';
import type { RoomIncidents } from './RoomIncidents.js';
import { isSequencedInteractionRequest, type RoomMedicine } from './RoomMedicine.js';
import type { RoomMovement } from './RoomMovement.js';
import type { RoomPatients } from './RoomPatients.js';
import { roomHealingMachines, type RoomState } from './RoomState.js';

/** Validates gameplay commands identically for network clients and server-side bots. */
export class RoomCommands {
  constructor(private readonly state: RoomState, private readonly movement: RoomMovement,
    private readonly patients: RoomPatients, private readonly medicine: RoomMedicine,
    private readonly incidents: RoomIncidents, private readonly abilities: RoomAbilities) {}

  input(playerId: string, input: unknown, now: number): void {
    if (this.state.phase !== 'running' ||
      !this.movement.accept(playerId, input, now, this.state.roundId)) return;
    const accepted = input as PlayerInput;
    this.medicine.onInput(playerId, accepted.interactHeld === true, accepted.direction, now);
    this.incidents.onInput(playerId, accepted.interactHeld === true, accepted.direction, now);
    this.abilities.onInput(playerId, accepted.abilityHeld === true, accepted.direction, now);
  }

  medicineInteract(playerId: string, input: unknown, now: number): PatientInteractionResult {
    const player = this.state.players.get(playerId);
    const position = this.movement.position(playerId);
    const facing = this.movement.facing(playerId);
    if (this.state.phase !== 'running' || !player || !position || !facing ||
      this.incidents.requiresRelease(playerId) || this.abilities.isHolding(playerId) ||
      !isSequencedInteractionRequest(input) ||
      !this.movement.acceptAction(playerId, input.sequence, input.roundId, this.state.roundId)) {
      return { ok: false, reason: 'Interaction unavailable or stale' };
    }
    return this.medicine.interact(playerId, input, position, facing, now, this.movement.isStationary(playerId, now));
  }

  patientInteract(playerId: string, input: unknown, now: number): PatientInteractionResult {
    const player = this.state.players.get(playerId);
    const position = this.movement.position(playerId);
    const facing = this.movement.facing(playerId);
    if (this.state.phase !== 'running' || !player || !position || !facing ||
      this.medicine.requiresRelease(playerId) || this.abilities.isHolding(playerId) ||
      !isSequencedInteractionRequest(input) ||
      !this.movement.acceptAction(playerId, input.sequence, input.roundId, this.state.roundId)) {
      return { ok: false, reason: 'Interaction unavailable' };
    }
    const machine = /^healing:([01])$/.exec(input.targetId);
    if (machine && roomHealingMachines(this.state)[Number(machine[1])]!.status === 'broken') {
      return this.incidents.interact(playerId, input, position, facing, now,
        this.movement.isStationary(playerId, now));
    }
    if (player.carriedMedicineId || this.incidents.requiresRelease(playerId)) {
      return { ok: false, reason: 'Empty hands and release E before interacting' };
    }
    return this.patients.interact(playerId, input, position, facing);
  }

  ability(playerId: string, input: unknown, now: number): PatientInteractionResult {
    const player = this.state.players.get(playerId);
    const position = this.movement.position(playerId);
    const facing = this.movement.facing(playerId);
    if (this.state.phase !== 'running' || !player || !position || !facing ||
      this.medicine.requiresRelease(playerId) || this.incidents.requiresRelease(playerId) ||
      !isSequencedInteractionRequest(input) ||
      !this.movement.acceptAction(playerId, input.sequence, input.roundId, this.state.roundId)) {
      return { ok: false, reason: 'Ability unavailable' };
    }
    return this.abilities.start(playerId, input, position, facing, now, this.movement.isStationary(playerId, now));
  }

  release(playerId: string): void {
    this.patients.releaseCarrier(playerId);
    this.medicine.releaseCarrier(playerId);
    this.incidents.releasePlayer(playerId);
    this.abilities.releasePlayer(playerId);
  }
}
