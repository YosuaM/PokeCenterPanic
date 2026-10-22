import {
  DISCHARGE_INTERACTION_POINT, HEALING_DURATION_MS, HEALING_MACHINE_FOOTPRINTS, PATIENT_SPECIES,
  RECOVERY_INTERACTION_POINT, RECOVERY_POSITION, HEALING_MACHINE_POSITIONS, RECEPTION_INTERACTION_POINTS,
  RECEPTION_SLOT_POSITIONS, TREATMENT, WAITING_INTERACTION_POINTS, WAITING_SLOT_POSITIONS,
  isInteractionReachable, isValidTreatmentSet, patientPresentation, patientTravelDuration, patientTravelPose,
  stationInteractionBounds, dischargePoints, streakBonus,
  PATIENT_ELEVATIONS,
  type Direction, type PatientInteractionRequest, type PatientInteractionResult,
  type PatientSpecies, type Point,
} from '@pokecenter/shared';
import { HealingMachineState, PatientState, resetHealingMachine, roomHealingMachines, type RoomState } from './RoomState.js';

const PROTOTYPE_PATIENCE_MS = 90_000;
const MAX_ACTIVE_PATIENTS = 10;

function rejection(reason: string): PatientInteractionResult {
  return { ok: false, reason };
}

export class RoomPatients {
  private nextId = 1;
  private readonly recoveryEnteredAt = new Map<string, number>();

  constructor(private readonly state: RoomState, private readonly now: () => number = () => performance.now()) {
    state.healingMachine = new HealingMachineState();
    state.secondHealingMachine = new HealingMachineState();
    for (const machine of roomHealingMachines(state)) resetHealingMachine(machine);
    state.dischargedCount = 0;
    state.lostCount = 0;
    state.admittedCount = 0;
    state.score = 0;
    state.streak = 0;
    state.bestStreak = 0;
    for (let index = 0; index < RECEPTION_SLOT_POSITIONS.length; index += 1) {
      state.receptionSlots.push('');
    }
    for (let index = 0; index < WAITING_SLOT_POSITIONS.length; index += 1) {
      state.waitingSlots.push('');
    }
  }

  reset(): void {
    this.state.patients.clear();
    for (let index = 0; index < this.state.receptionSlots.length; index += 1) {
      this.state.receptionSlots[index] = '';
    }
    for (let index = 0; index < this.state.waitingSlots.length; index += 1) {
      this.state.waitingSlots[index] = '';
    }
    this.state.recoveryQueue.splice(0);
    for (const machine of roomHealingMachines(this.state)) resetHealingMachine(machine);
    this.state.dischargedCount = 0;
    this.state.lostCount = 0;
    this.state.admittedCount = 0;
    this.state.score = 0;
    this.state.streak = 0;
    this.state.bestStreak = 0;
    for (const player of this.state.players.values()) player.carriedPatientId = '';
    this.recoveryEnteredAt.clear();
    this.nextId = 1;
  }

  admit(species: PatientSpecies, requiredTreatments: number, slotIndex: number,
    location: 'reception' | 'waiting' = 'reception', patienceMs = PROTOTYPE_PATIENCE_MS): PatientState | null {
    const slots = location === 'waiting' ? this.state.waitingSlots : this.state.receptionSlots;
    if (!PATIENT_SPECIES.includes(species) || !isValidTreatmentSet(requiredTreatments) ||
      !Number.isFinite(patienceMs) || patienceMs <= 0 ||
      !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slots.length ||
      slots[slotIndex] !== '' ||
      [...this.state.patients.values()].filter((patient) => patient.lifecycle === 'active').length >= MAX_ACTIVE_PATIENTS) {
      return null;
    }

    const patient = new PatientState();
    patient.id = `patient-${this.nextId++}`;
    patient.species = species;
    patient.requiredTreatments = requiredTreatments;
    patient.completedTreatments = 0;
    patient.initialPatienceMs = patienceMs;
    patient.remainingPatienceMs = patienceMs;
    patient.lifecycle = 'active';
    patient.location = location;
    patient.slotIndex = slotIndex;
    patient.carrierId = '';
    patient.travelKind = location === 'waiting' ? 'arriving' : '';
    patient.travelElapsedMs = 0;
    this.state.patients.set(patient.id, patient);
    slots[slotIndex] = patient.id;
    this.state.admittedCount += 1;
    this.assertOwnership();
    return patient;
  }

  advance(elapsedMs: number, exclusiveEnd = false): void {
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return;
    for (const patient of this.state.patients.values()) {
      if (patient.lifecycle !== 'active') {
        if (patient.travelKind !== 'leaving' && patient.travelKind !== 'fainting') continue;
        patient.travelElapsedMs += elapsedMs;
        if (patient.travelElapsedMs >= patientTravelDuration({ travelKind: patient.travelKind,
          slotIndex: patient.slotIndex })) this.state.patients.delete(patient.id);
        continue;
      }
      // Only the portion of this tick spent actively healing pauses patience.
      const machine = patient.location === 'healingMachine' ? roomHealingMachines(this.state)[patient.slotIndex] : undefined;
      const healing = patient.remainingPatienceMs > 0 && machine?.patientId === patient.id &&
        machine.status === 'treating' && (patient.requiredTreatments & TREATMENT.healing) !== 0 &&
        (patient.completedTreatments & TREATMENT.healing) === 0;
      const pausedMs = healing ? Math.min(elapsedMs, Math.max(0, machine.remainingMs)) : 0;
      const patienceExpiresAtEnd = patient.remainingPatienceMs === elapsedMs - pausedMs;
      if (healing) {
        const healingCompletesAtEnd = machine.remainingMs === elapsedMs;
        machine.remainingMs = Math.max(0, machine.remainingMs - elapsedMs);
        if (machine.remainingMs === 0 && !(exclusiveEnd && healingCompletesAtEnd)) {
          patient.completedTreatments |= TREATMENT.healing;
          machine.status = 'completed';
        }
      }
      if (patient.travelKind === 'arriving') {
        patient.travelElapsedMs += Math.min(elapsedMs, patient.remainingPatienceMs);
        if (patient.travelElapsedMs >= patientTravelDuration({ travelKind: 'arriving',
          slotIndex: patient.slotIndex })) {
          patient.travelKind = '';
          patient.travelElapsedMs = 0;
        }
      }
      patient.remainingPatienceMs = Math.max(0, patient.remainingPatienceMs - (elapsedMs - pausedMs));
      if (patient.remainingPatienceMs === 0 && !(exclusiveEnd && patienceExpiresAtEnd)) this.lose(patient);
    }
    this.assertOwnership();
  }

  private lose(patient: PatientState): void {
    const travel = patient.travelKind === 'arriving' ? patientTravelPose({
      travelKind: 'arriving', travelElapsedMs: patient.travelElapsedMs, slotIndex: patient.slotIndex,
    }) : undefined;
    const carrier = this.state.players.get(patient.carrierId);
    const point = travel?.point ?? (patient.location === 'waiting' ? WAITING_SLOT_POSITIONS[patient.slotIndex] :
      patient.location === 'reception' ? RECEPTION_SLOT_POSITIONS[patient.slotIndex] :
      patient.location === 'healingMachine' ? HEALING_MACHINE_POSITIONS[patient.slotIndex] :
      patient.location === 'recovery' ? RECOVERY_POSITION : carrier);
    patient.faintX = point?.x ?? RECOVERY_POSITION.x;
    patient.faintY = point?.y ?? RECOVERY_POSITION.y;
    patient.faintElevation = travel?.elevation ?? PATIENT_ELEVATIONS[patient.location] ?? 0.03;
    if (patient.location === 'reception') this.state.receptionSlots[patient.slotIndex] = '';
    if (patient.location === 'waiting') this.state.waitingSlots[patient.slotIndex] = '';
    if (patient.location === 'carrier' && carrier) carrier.carriedPatientId = '';
    if (patient.location === 'recovery') {
      this.state.recoveryQueue.splice(patient.slotIndex, 1);
      this.recoveryEnteredAt.delete(patient.id);
      for (let index = 0; index < this.state.recoveryQueue.length; index += 1) {
        this.state.patients.get(this.state.recoveryQueue[index]!)!.slotIndex = index;
      }
    }
    if (patient.location === 'healingMachine') {
      const machine = roomHealingMachines(this.state)[patient.slotIndex]!;
      machine.patientId = '';
      if (machine.status !== 'broken') machine.status = 'empty';
      machine.remainingMs = 0;
    }
    patient.lifecycle = 'lost';
    patient.location = 'none';
    patient.carrierId = '';
    patient.slotIndex = -1;
    patient.travelKind = 'fainting';
    patient.travelElapsedMs = 0;
    this.state.lostCount += 1;
    this.state.score -= 50;
    this.state.streak = 0;
  }

  finishRound(): void {
    for (const patient of this.state.patients.values()) {
      if (patient.lifecycle === 'active') patient.lifecycle = 'unfinished';
      patient.location = 'none';
      patient.carrierId = '';
      patient.slotIndex = -1;
      patient.travelKind = '';
      patient.travelElapsedMs = 0;
    }
    for (const slots of [this.state.receptionSlots, this.state.waitingSlots]) {
      for (let index = 0; index < slots.length; index++) slots[index] = '';
    }
    this.state.recoveryQueue.splice(0);
    this.recoveryEnteredAt.clear();
    for (const player of this.state.players.values()) player.carriedPatientId = '';
    for (const machine of roomHealingMachines(this.state)) resetHealingMachine(machine);
    this.assertOwnership();
  }

  interact(playerId: string, value: unknown, position: Point, facing: Direction): PatientInteractionResult {
    const player = this.state.players.get(playerId);
    if (!player || !isInteractionRequest(value)) return rejection('Invalid interaction');

    const { targetId, expectedOccupantId } = value;
    const healingMatch = /^healing:([01])$/.exec(targetId);
    const machineIndex = healingMatch ? Number(healingMatch[1]) : -1;
    const match = /^(reception|waiting):(0|[1-9]\d*)$/.exec(targetId);
    const kind = match?.[1];
    const index = match ? Number(match[2]) : -1;
    const point = kind === 'reception' ? RECEPTION_INTERACTION_POINTS[index] :
      kind === 'waiting' ? WAITING_INTERACTION_POINTS[index] :
        targetId === 'recovery' ? RECOVERY_INTERACTION_POINT :
          healingMatch ? HEALING_MACHINE_FOOTPRINTS[machineIndex] :
            targetId === 'discharge' ? DISCHARGE_INTERACTION_POINT : undefined;
    if (!point) return rejection('Unknown target');
    if (!isInteractionReachable(position, facing, stationInteractionBounds(targetId) ?? point)) {
      return rejection('Out of range or blocked');
    }

    if (kind === 'reception') {
      return this.pickup(playerId, this.state.receptionSlots, index, 'reception', expectedOccupantId);
    }
    if (kind === 'waiting') {
      return player.carriedPatientId ? this.placeInWaiting(playerId, index, expectedOccupantId) :
        this.pickup(playerId, this.state.waitingSlots, index, 'waiting', expectedOccupantId);
    }
    if (healingMatch) return this.interactHealing(playerId, expectedOccupantId, machineIndex);
    if (targetId === 'discharge') return this.discharge(playerId, expectedOccupantId);
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
    for (const [index, machine] of roomHealingMachines(this.state).entries()) {
      if (machine.patientId) verify(machine.patientId, 'healingMachine', index);
      else if (!['empty', 'broken'].includes(machine.status) || machine.remainingMs !== 0) {
        throw new Error('Empty machine has treatment state');
      }
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
    if (patient.travelKind) return rejection('Patient is walking to the waiting room');
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

  private interactHealing(playerId: string, expectedId: string, index: number): PatientInteractionResult {
    const player = this.state.players.get(playerId)!;
    const machine = roomHealingMachines(this.state)[index]!;
    if (machine.patientId !== expectedId) return rejection('Machine occupant changed');
    if (machine.status === 'broken') return rejection('Machine offline: empty hands and hold E to repair');
    if (player.carriedPatientId) {
      if (machine.status !== 'empty') return rejection('Machine occupied');
      const patient = this.state.patients.get(player.carriedPatientId);
      if (!patient || patient.lifecycle !== 'active' || patient.location !== 'carrier' ||
        patient.carrierId !== playerId) return rejection('Patient unavailable');
      if (!(patient.requiredTreatments & TREATMENT.healing) ||
        (patient.completedTreatments & TREATMENT.healing)) return rejection('Healing not needed');
      player.carriedPatientId = '';
      patient.carrierId = '';
      patient.location = 'healingMachine';
      patient.slotIndex = index;
      machine.patientId = patient.id;
      machine.status = 'treating';
      machine.remainingMs = HEALING_DURATION_MS;
      this.assertOwnership();
      return { ok: true, reason: '' };
    }
    if (!machine.patientId) return rejection('Machine empty');
    if (machine.status !== 'completed') return rejection('Treatment in progress');
    const patient = this.state.patients.get(machine.patientId);
    if (!patient || patient.lifecycle !== 'active' || patient.location !== 'healingMachine') {
      return rejection('Patient unavailable');
    }
    machine.patientId = '';
    machine.status = 'empty';
    machine.remainingMs = 0;
    this.giveToPlayer(patient, playerId);
    this.assertOwnership();
    return { ok: true, reason: '' };
  }

  private discharge(playerId: string, expectedId: string): PatientInteractionResult {
    const player = this.state.players.get(playerId)!;
    if (!player.carriedPatientId) return rejection('No patient to discharge');
    if (player.carriedPatientId !== expectedId) return rejection('Carried patient changed');
    const patient = this.state.patients.get(player.carriedPatientId);
    if (!patient || patient.lifecycle !== 'active' || patient.location !== 'carrier' ||
      patient.carrierId !== playerId) return rejection('Patient unavailable');
    if (!patientPresentation({ requiredTreatments: patient.requiredTreatments,
      completedTreatments: patient.completedTreatments, lifecycle: 'active',
      initialPatienceMs: patient.initialPatienceMs, remainingPatienceMs: patient.remainingPatienceMs }).readyForDischarge) {
      return rejection('Treatment still required');
    }
    player.carriedPatientId = '';
    patient.carrierId = '';
    patient.location = 'none';
    patient.slotIndex = -1;
    patient.lifecycle = 'discharged';
    patient.travelKind = 'leaving';
    patient.travelElapsedMs = 0;
    this.state.dischargedCount += 1;
    this.state.streak += 1;
    this.state.bestStreak = Math.max(this.state.bestStreak, this.state.streak);
    this.state.score += dischargePoints(patient) + streakBonus(this.state.streak);
    this.assertOwnership();
    return { ok: true, reason: '' };
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
