import {
  PATIENT_SPECIES, RECOVERY_INTERACTION_POINT, RECEPTION_INTERACTION_POINTS,
  RECEPTION_SLOT_POSITIONS, TREATMENT, WAITING_INTERACTION_POINTS, WAITING_SLOT_POSITIONS,
  isInteractionReachable, isValidTreatmentSet,
  type Direction, type PatientInteractionRequest, type PatientInteractionResult,
  type PatientSpecies, type Point,
} from '@pokecenter/shared';
import { PatientState, type RoomState } from './RoomState.js';

const PROTOTYPE_PATIENCE_MS = 90_000;
const MAX_ACTIVE_PATIENTS = 10;

function rejection(reason: string): PatientInteractionResult {
  return { ok: false, reason };
}

export class RoomPatients {
  private nextId = 1;
  private readonly recoveryEnteredAt = new Map<string, number>();

  constructor(private readonly state: RoomState, private readonly now: () => number = () => performance.now()) {
    for (let index = 0; index < RECEPTION_SLOT_POSITIONS.length; index += 1) {
      state.receptionSlots.push('');
    }
    for (let index = 0; index < WAITING_SLOT_POSITIONS.length; index += 1) {
      state.waitingSlots.push('');
    }
  }

  admit(species: PatientSpecies, requiredTreatments: number, slotIndex: number): PatientState | null {
    if (!PATIENT_SPECIES.includes(species) || !isValidTreatmentSet(requiredTreatments) ||
      !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= this.state.receptionSlots.length ||
      this.state.receptionSlots[slotIndex] !== '' || this.state.patients.size >= MAX_ACTIVE_PATIENTS) return null;

    const patient = new PatientState();
    patient.id = `patient-${this.nextId++}`;
    patient.species = species;
    patient.requiredTreatments = requiredTreatments;
    patient.completedTreatments = 0;
    patient.initialPatienceMs = PROTOTYPE_PATIENCE_MS;
    patient.remainingPatienceMs = PROTOTYPE_PATIENCE_MS;
    patient.lifecycle = 'active';
    patient.location = 'reception';
    patient.slotIndex = slotIndex;
    patient.carrierId = '';
    this.state.patients.set(patient.id, patient);
    this.state.receptionSlots[slotIndex] = patient.id;
    this.assertOwnership();
    return patient;
  }

  interact(playerId: string, value: unknown, position: Point, facing: Direction): PatientInteractionResult {
    const player = this.state.players.get(playerId);
    if (!player || !isInteractionRequest(value)) return rejection('Invalid interaction');

    const { targetId, expectedOccupantId } = value;
    const match = /^(reception|waiting):([0-3])$/.exec(targetId);
    const kind = match?.[1];
    const index = match ? Number(match[2]) : -1;
    const point = kind === 'reception' ? RECEPTION_INTERACTION_POINTS[index] :
      kind === 'waiting' ? WAITING_INTERACTION_POINTS[index] :
        targetId === 'recovery' ? RECOVERY_INTERACTION_POINT : undefined;
    if (!point) return rejection('Unknown target');
    if (!isInteractionReachable(position, facing, point)) return rejection('Out of range or blocked');

    if (kind === 'reception') {
      return this.pickup(playerId, this.state.receptionSlots, index, 'reception', expectedOccupantId);
    }
    if (kind === 'waiting') {
      return player.carriedPatientId ? this.placeInWaiting(playerId, index, expectedOccupantId) :
        this.pickup(playerId, this.state.waitingSlots, index, 'waiting', expectedOccupantId);
    }
    if (player.carriedPatientId) return rejection('Hands are full');
    const front = this.state.recoveryQueue[0] ?? '';
    if (!front || front !== expectedOccupantId) return rejection('Patient already claimed or removed');
    const patient = this.state.patients.get(front);
    if (!patient || patient.lifecycle !== 'active' || patient.location !== 'recovery' || patient.slotIndex !== 0) {
      return rejection('Patient unavailable');
    }
    this.state.recoveryQueue.shift();
    this.recoveryEnteredAt.delete(front);
    for (let queueIndex = 0; queueIndex < this.state.recoveryQueue.length; queueIndex += 1) {
      this.state.patients.get(this.state.recoveryQueue[queueIndex]!)!.slotIndex = queueIndex;
    }
    this.giveToPlayer(patient, playerId);
    this.assertOwnership();
    return { ok: true, reason: '' };
  }

  releaseCarrier(playerId: string): void {
    const player = this.state.players.get(playerId);
    if (!player?.carriedPatientId) return;
    const patient = this.state.patients.get(player.carriedPatientId);
    if (!patient || patient.lifecycle !== 'active' || patient.location !== 'carrier' ||
      patient.carrierId !== playerId) throw new Error('Invalid carrier ownership');

    const waitingIndex = [...this.state.waitingSlots].findIndex((id) => id === '');
    if (waitingIndex >= 0) {
      this.state.waitingSlots[waitingIndex] = patient.id;
      patient.location = 'waiting';
      patient.slotIndex = waitingIndex;
    } else {
      if (this.state.recoveryQueue.length >= MAX_ACTIVE_PATIENTS) throw new Error('Recovery is full');
      patient.location = 'recovery';
      this.recoveryEnteredAt.set(patient.id, this.now());
      this.state.recoveryQueue.push(patient.id);
      this.state.recoveryQueue.sort((left, right) =>
        this.recoveryEnteredAt.get(left)! - this.recoveryEnteredAt.get(right)! || left.localeCompare(right));
      for (let queueIndex = 0; queueIndex < this.state.recoveryQueue.length; queueIndex += 1) {
        this.state.patients.get(this.state.recoveryQueue[queueIndex]!)!.slotIndex = queueIndex;
      }
    }
    patient.carrierId = '';
    player.carriedPatientId = '';
    this.assertOwnership();
  }

  assertOwnership(): void {
    const seen = new Set<string>();
    const verify = (id: string, location: string, index: number, carrierId = '') => {
      const patient = this.state.patients.get(id);
      if (!patient || patient.lifecycle !== 'active' || patient.location !== location ||
        patient.slotIndex !== index || patient.carrierId !== carrierId || seen.has(id)) {
        throw new Error(`Invalid ${location} owner ${id}`);
      }
      seen.add(id);
    };
    for (let index = 0; index < this.state.receptionSlots.length; index += 1) {
      const id = this.state.receptionSlots[index];
      if (id) verify(id, 'reception', index);
    }
    for (let index = 0; index < this.state.waitingSlots.length; index += 1) {
      const id = this.state.waitingSlots[index];
      if (id) verify(id, 'waiting', index);
    }
    for (let index = 0; index < this.state.recoveryQueue.length; index += 1) {
      verify(this.state.recoveryQueue[index]!, 'recovery', index);
    }
    for (const [playerId, player] of this.state.players) {
      if (player.carriedPatientId) verify(player.carriedPatientId, 'carrier', -1, playerId);
    }
    for (const [id, patient] of this.state.patients) {
      if (patient.lifecycle === 'active' && !seen.has(id)) throw new Error(`Unowned active patient ${id}`);
      if (patient.lifecycle !== 'active' &&
        (patient.location !== 'none' || patient.slotIndex !== -1 || patient.carrierId)) {
        throw new Error(`Terminal patient still owned ${id}`);
      }
    }
  }

  private pickup(playerId: string, slots: RoomState['receptionSlots'], index: number,
    location: 'reception' | 'waiting', expectedId: string): PatientInteractionResult {
    const player = this.state.players.get(playerId)!;
    if (player.carriedPatientId) return rejection('Hands are full');
    const id = slots[index];
    if (!id || id !== expectedId) return rejection('Patient already claimed or removed');
    const patient = this.state.patients.get(id);
    if (!patient || patient.lifecycle !== 'active' || patient.location !== location ||
      patient.slotIndex !== index) return rejection('Patient unavailable');
    slots[index] = '';
    this.giveToPlayer(patient, playerId);
    this.assertOwnership();
    return { ok: true, reason: '' };
  }

  private placeInWaiting(playerId: string, index: number, expectedId: string): PatientInteractionResult {
    const player = this.state.players.get(playerId)!;
    if (this.state.waitingSlots[index] !== expectedId || expectedId !== '') return rejection('Slot is occupied');
    const patient = this.state.patients.get(player.carriedPatientId);
    if (!patient || patient.lifecycle !== 'active' || patient.location !== 'carrier' ||
      patient.carrierId !== playerId) return rejection('Patient unavailable');
    player.carriedPatientId = '';
    patient.carrierId = '';
    patient.location = 'waiting';
    patient.slotIndex = index;
    this.state.waitingSlots[index] = patient.id;
    this.assertOwnership();
    return { ok: true, reason: '' };
  }

  private giveToPlayer(patient: PatientState, playerId: string): void {
    const player = this.state.players.get(playerId)!;
    patient.location = 'carrier';
    patient.slotIndex = -1;
    patient.carrierId = playerId;
    player.carriedPatientId = patient.id;
  }
}

function isInteractionRequest(value: unknown): value is PatientInteractionRequest {
  if (typeof value !== 'object' || value === null) return false;
  const request = value as Partial<PatientInteractionRequest>;
  return typeof request.targetId === 'string' && request.targetId.length <= 32 &&
    typeof request.expectedOccupantId === 'string' && request.expectedOccupantId.length <= 64;
}

export function seedPrototypePatient(patients: RoomPatients): void {
  if (!patients.admit('Pikachu', TREATMENT.healing, 0)) {
    throw new Error('Could not admit the prototype patient');
  }
}
