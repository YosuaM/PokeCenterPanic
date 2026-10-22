import {
  HEALING_MACHINE_FOOTPRINTS, MEDICINE_DISPOSAL_POINT, MEDICINE_KINDS, characterProfile,
  MEDICINE_PREPARATION_POINTS, MEDICINE_SURFACE_POINTS, RECEPTION_INTERACTION_POINTS,
  RECOVERY_INTERACTION_POINT, TREATMENT, WAITING_INTERACTION_POINTS, isInteractionReachable,
  stationInteractionBounds,
  type Direction, type MedicineDiscardEvent, type MedicineInteractionRequest, type PatientInteractionResult, type Point,
} from '@pokecenter/shared';
import { MedicineDoseState, roomHealingMachines, type RoomState } from './RoomState.js';

interface Preparation {
  playerId: string;
  startedAt: number;
  lastHeldAt: number;
  pointIndex: number;
  durationMs: number;
}

const reject = (reason: string): PatientInteractionResult => ({ ok: false, reason });
const success = (): PatientInteractionResult => ({ ok: true, reason: '' });

export function isSequencedInteractionRequest(value: unknown): value is MedicineInteractionRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Partial<MedicineInteractionRequest>;
  return typeof request.targetId === 'string' && typeof request.expectedOccupantId === 'string' &&
    Number.isSafeInteger(request.sequence) && Number(request.sequence) > 0 &&
    typeof request.roundId === 'string';
}

export class RoomMedicine {
  private nextId = 1;
  private readonly preparations = new Map<string, Preparation>();
  private readonly releaseRequired = new Set<string>();

  constructor(private readonly state: RoomState,
    private readonly onDiscard: (event: MedicineDiscardEvent) => void = () => {}) {
    for (let index = 0; index < MEDICINE_SURFACE_POINTS.length; index += 1) state.medicineSurfaces.push('');
    for (let index = 0; index < MEDICINE_PREPARATION_POINTS.length; index += 1) {
      state.medicinePreparationOwners.push('');
      state.medicinePreparationRemainingMs.push(0);
    }
  }

  reset(): void {
    this.state.medicineDoses.clear();
    for (const player of this.state.players.values()) player.carriedMedicineId = '';
    for (let index = 0; index < this.state.medicineSurfaces.length; index += 1) {
      this.state.medicineSurfaces[index] = '';
    }
    for (let index = 0; index < this.state.medicinePreparationOwners.length; index += 1) {
      this.state.medicinePreparationOwners[index] = '';
      this.state.medicinePreparationRemainingMs[index] = 0;
    }
    this.preparations.clear();
    this.releaseRequired.clear();
    this.nextId = 1;
  }

  isPreparing(playerId: string): boolean { return this.preparations.has(playerId); }
  requiresRelease(playerId: string): boolean { return this.releaseRequired.has(playerId); }

  interact(playerId: string, request: MedicineInteractionRequest, position: Point,
    facing: Direction, now: number, stationary: boolean): PatientInteractionResult {
    const player = this.state.players.get(playerId);
    if (!player?.connected) return reject('Interaction unavailable');
    if (this.releaseRequired.has(playerId)) return reject('Release E before interacting again');
    const prep = /^medicine:prep:([01])$/.exec(request.targetId);
    const surface = /^medicine:surface:([0-3])$/.exec(request.targetId);
    const application = /^medicine:apply:(reception|waiting):(0|[1-9]\d*)$/.exec(request.targetId);
    const applicationLocation = application?.[1];
    const applicationIndex = application ? Number(application[2]) : -1;
    const healing = /^medicine:apply:healing:([01])$/.exec(request.targetId);
    const point = prep ? MEDICINE_PREPARATION_POINTS[Number(prep[1])] : surface ?
      MEDICINE_SURFACE_POINTS[Number(surface[1])] : applicationLocation === 'reception' ?
        RECEPTION_INTERACTION_POINTS[applicationIndex] : applicationLocation === 'waiting' ?
          WAITING_INTERACTION_POINTS[applicationIndex] :
          request.targetId === 'medicine:apply:recovery' ? RECOVERY_INTERACTION_POINT :
            healing ? HEALING_MACHINE_FOOTPRINTS[Number(healing[1])] :
              request.targetId === 'medicine:disposal' ? MEDICINE_DISPOSAL_POINT : undefined;
    if (!point || !isInteractionReachable(position, facing, stationInteractionBounds(request.targetId) ?? point)) {
      return reject('Target out of range');
    }
    if (prep) {
      const index = Number(prep[1]);
      if (request.expectedOccupantId !== '') return reject('Preparation point changed');
      if (player.carriedPatientId || player.carriedMedicineId) return reject('Hands must be empty');
      if (!stationary) return reject('Stop moving to prepare medicine');
      if (this.state.medicinePreparationOwners[index]) return reject('Preparation point occupied');
      const durationMs = characterProfile(player.character).preparationMs;
      this.preparations.set(playerId, { playerId, startedAt: now, lastHeldAt: now, pointIndex: index, durationMs });
      this.state.medicinePreparationOwners[index] = playerId;
      this.state.medicinePreparationRemainingMs[index] = durationMs;
      this.releaseRequired.add(playerId);
      return success();
    }
    if (surface) {
      const index = Number(surface[1]);
      const occupantId = this.state.medicineSurfaces[index] ?? '';
      if (request.expectedOccupantId !== occupantId) return reject('Medicine surface changed');
      if (player.carriedPatientId) return reject('Hands must be empty');
      if (player.carriedMedicineId) {
        if (occupantId) return reject('Medicine surface occupied');
        const dose = this.state.medicineDoses.get(player.carriedMedicineId);
        if (!dose || dose.carrierId !== playerId || dose.location !== 'carrier') {
          return reject('Carried medicine unavailable');
        }
        dose.location = 'surface';
        dose.carrierId = '';
        dose.slotIndex = index;
        this.state.medicineSurfaces[index] = dose.id;
        player.carriedMedicineId = '';
      } else {
        if (!occupantId) return reject('Medicine surface empty');
        const dose = this.state.medicineDoses.get(occupantId);
        if (!dose || dose.location !== 'surface' || dose.slotIndex !== index) {
          return reject('Medicine unavailable');
        }
        dose.location = 'carrier';
        dose.carrierId = playerId;
        dose.slotIndex = -1;
        this.state.medicineSurfaces[index] = '';
        player.carriedMedicineId = dose.id;
      }
      this.releaseRequired.add(playerId);
      this.assertOwnership();
      return success();
    }
    if (application || request.targetId.startsWith('medicine:apply:')) {
      return this.apply(playerId, request, applicationLocation, applicationIndex);
    }
    if (request.expectedOccupantId !== player.carriedMedicineId || !player.carriedMedicineId) {
      return reject('No carried medicine to discard');
    }
    const dose = this.state.medicineDoses.get(player.carriedMedicineId);
    if (!dose || dose.location !== 'carrier' || dose.carrierId !== playerId ||
      (dose.kind !== 'burnHeal' && dose.kind !== 'antidote')) {
      return reject('Carried medicine unavailable');
    }
    const event: MedicineDiscardEvent = { roundId: this.state.roundId, doseId: dose.id, kind: dose.kind };
    this.state.medicineDoses.delete(player.carriedMedicineId);
    player.carriedMedicineId = '';
    this.releaseRequired.add(playerId);
    this.assertOwnership();
    this.onDiscard(event);
    return success();
  }

  private apply(playerId: string, request: MedicineInteractionRequest,
    location: string | undefined, index: number): PatientInteractionResult {
    const player = this.state.players.get(playerId)!;
    if (player.carriedPatientId || !player.carriedMedicineId) return reject('No carried medicine');
    const dose = this.state.medicineDoses.get(player.carriedMedicineId);
    if (!dose || dose.location !== 'carrier' || dose.carrierId !== playerId) {
      return reject('Carried medicine unavailable');
    }
    const healing = /^medicine:apply:healing:([01])$/.exec(request.targetId);
    const machineIndex = healing ? Number(healing[1]) : 0;
    const machine = roomHealingMachines(this.state)[machineIndex]!;
    const patientId = location === 'reception' ? this.state.receptionSlots[index] :
      location === 'waiting' ? this.state.waitingSlots[index] :
        request.targetId === 'medicine:apply:recovery' ? this.state.recoveryQueue[0] :
          machine.patientId;
    if (!patientId || patientId !== request.expectedOccupantId) return reject('Patient changed or removed');
    const patient = this.state.patients.get(patientId);
    const patientLocation = location ?? (request.targetId === 'medicine:apply:recovery' ?
      'recovery' : 'healingMachine');
    const patientIndex = location ? index : patientLocation === 'healingMachine' ? machineIndex : 0;
    if (!patient || patient.lifecycle !== 'active' || patient.location !== patientLocation ||
      patient.slotIndex !== patientIndex || patient.carrierId || patient.travelKind) return reject('Patient unavailable');
    if (patientLocation === 'healingMachine' && machine.status !== 'completed') {
      return reject('Healing machine unavailable');
    }
    const treatment = dose.kind === 'burnHeal' ? TREATMENT.burnHeal :
      dose.kind === 'antidote' ? TREATMENT.antidote : 0;
    if (!treatment || !(patient.requiredTreatments & treatment)) return reject('Wrong medicine');
    if (patient.completedTreatments & treatment) return reject('Treatment already complete');
    patient.completedTreatments |= treatment;
    this.state.medicineDoses.delete(dose.id);
    player.carriedMedicineId = '';
    this.releaseRequired.add(playerId);
    this.assertOwnership();
    return success();
  }

  onInput(playerId: string, interactHeld: boolean, direction: Direction | null, now: number): void {
    if (!interactHeld) {
      this.cancel(playerId);
      this.releaseRequired.delete(playerId);
      return;
    }
    const preparation = this.preparations.get(playerId);
    if (!preparation) return;
    if (direction) this.cancel(playerId);
    else preparation.lastHeldAt = now;
  }

  advance(now: number, positionFor: (id: string) => Point | undefined,
    facingFor: (id: string) => Direction | undefined, exclusiveEnd = false): void {
    for (const preparation of [...this.preparations.values()]) {
      const { playerId, pointIndex, startedAt, lastHeldAt, durationMs } = preparation;
      const player = this.state.players.get(playerId);
      const position = positionFor(playerId);
      const facing = facingFor(playerId);
      const completesAt = startedAt + durationMs;
      const inputExpiresAt = lastHeldAt + 250;
      const completes = completesAt <= now && !(exclusiveEnd && completesAt === now);
      if (!player?.connected || !position || !facing ||
        (inputExpiresAt <= now && (!completes || inputExpiresAt <= completesAt)) ||
        player.carriedPatientId || player.carriedMedicineId ||
        !isInteractionReachable(position, facing, stationInteractionBounds(`medicine:prep:${pointIndex}`)!)) {
        this.cancel(playerId);
        continue;
      }
      const remaining = Math.max(0, durationMs - (now - startedAt));
      this.state.medicinePreparationRemainingMs[pointIndex] = remaining;
      if (!completes) continue;
      const dose = new MedicineDoseState();
      dose.id = `dose-${this.nextId++}`;
      dose.kind = MEDICINE_KINDS[pointIndex]!;
      dose.location = 'carrier';
      dose.carrierId = playerId;
      dose.slotIndex = -1;
      this.state.medicineDoses.set(dose.id, dose);
      player.carriedMedicineId = dose.id;
      this.cancel(playerId);
      this.assertOwnership();
    }
  }

  cancel(playerId: string): void {
    const preparation = this.preparations.get(playerId);
    if (!preparation) return;
    this.preparations.delete(playerId);
    this.state.medicinePreparationOwners[preparation.pointIndex] = '';
    this.state.medicinePreparationRemainingMs[preparation.pointIndex] = 0;
  }

  releaseCarrier(playerId: string): void {
    this.cancel(playerId);
    this.releaseRequired.delete(playerId);
    const player = this.state.players.get(playerId);
    if (!player?.carriedMedicineId) return;
    const dose = this.state.medicineDoses.get(player.carriedMedicineId);
    if (!dose || dose.location !== 'carrier' || dose.carrierId !== playerId) {
      throw new Error('Invalid medicine carrier');
    }
    const index = this.state.medicineSurfaces.findIndex((id) => !id);
    if (index < 0) this.state.medicineDoses.delete(dose.id);
    else {
      dose.location = 'surface';
      dose.carrierId = '';
      dose.slotIndex = index;
      this.state.medicineSurfaces[index] = dose.id;
    }
    player.carriedMedicineId = '';
    this.assertOwnership();
  }

  assertOwnership(): void {
    const owners = new Map<string, number>();
    for (const player of this.state.players.values()) {
      if (player.carriedPatientId && player.carriedMedicineId) throw new Error('Player carries two entities');
      if (player.carriedMedicineId) owners.set(player.carriedMedicineId,
        (owners.get(player.carriedMedicineId) ?? 0) + 1);
    }
    for (const id of this.state.medicineSurfaces) {
      if (id) owners.set(id, (owners.get(id) ?? 0) + 1);
    }
    for (const [id, dose] of this.state.medicineDoses) {
      if (owners.get(id) !== 1 || (dose.location === 'carrier' ?
        dose.carrierId === '' || dose.slotIndex !== -1 ||
          this.state.players.get(dose.carrierId)?.carriedMedicineId !== id :
        dose.location !== 'surface' || dose.carrierId !== '' ||
          this.state.medicineSurfaces[dose.slotIndex] !== id)) {
        throw new Error('Invalid medicine ownership');
      }
    }
    for (const id of owners.keys()) {
      if (!this.state.medicineDoses.has(id)) throw new Error('Unknown medicine owner');
    }
  }
}
