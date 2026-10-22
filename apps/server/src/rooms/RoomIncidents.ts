import { FINAL_CLEARANCE_MS, HEALING_MACHINE_FOOTPRINTS, TREATMENT, characterProfile,
  isInteractionReachable, type Direction, type PatientInteractionRequest,
  type PatientInteractionResult, type Point } from '@pokecenter/shared';
import { roomHealingMachines, type RoomState } from './RoomState.js';

interface Repair {
  playerId: string;
  machineIndex: number;
  startedAt: number;
  lastHeldAt: number;
  durationMs: number;
}

const reject = (reason: string): PatientInteractionResult => ({ ok: false, reason });

export class RoomIncidents {
  private readonly triggeredPatients = new Set<string>();
  private readonly releaseRequired = new Set<string>();
  private lastOutageAt = -Infinity;
  private repair: Repair | undefined;

  constructor(private readonly state: RoomState) {}

  reset(): void {
    this.cancelRepair();
    this.triggeredPatients.clear();
    this.releaseRequired.clear();
    this.lastOutageAt = -Infinity;
  }

  finishRound(): void {
    this.cancelRepair();
    this.releaseRequired.clear();
  }

  evaluate(now: number, elapsedMs: number): void {
    const machines = roomHealingMachines(this.state);
    if (this.state.phase !== 'running' || !Number.isFinite(now) || !Number.isFinite(elapsedMs) ||
      elapsedMs < 60000 || this.state.roundRemainingMs <= FINAL_CLEARANCE_MS ||
      now - this.lastOutageAt < 60000 || machines.some((machine) => machine.status === 'broken') ||
      ![...this.state.players.values()].some((player) => player.connected)) return;
    const patient = [...this.state.patients.values()].filter((candidate) =>
      candidate.lifecycle === 'active' && candidate.species === 'Pikachu' &&
      candidate.initialPatienceMs > 0 && candidate.remainingPatienceMs > 0 &&
      candidate.remainingPatienceMs <= candidate.initialPatienceMs / 2 &&
      !this.triggeredPatients.has(candidate.id))
      .sort((left, right) => left.remainingPatienceMs - right.remainingPatienceMs ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))[0];
    const machine = machines.find((candidate) => ['empty', 'treating', 'completed'].includes(candidate.status));
    if (!patient || !machine) return;
    machine.status = 'broken';
    machine.repairOwnerId = '';
    machine.repairRemainingMs = 0;
    this.triggeredPatients.add(patient.id);
    this.lastOutageAt = now;
  }

  requiresRelease(playerId: string): boolean { return this.releaseRequired.has(playerId); }
  isRepairing(playerId: string): boolean { return this.repair?.playerId === playerId; }

  interact(playerId: string, request: PatientInteractionRequest, position: Point,
    facing: Direction, now: number, stationary: boolean): PatientInteractionResult {
    const match = /^healing:([01])$/.exec(request.targetId);
    const index = match ? Number(match[1]) : -1;
    const machine = roomHealingMachines(this.state)[index];
    const player = this.state.players.get(playerId);
    if (this.state.phase !== 'running' || !Number.isFinite(now) || !player?.connected || !machine ||
      !isInteractionReachable(position, facing, HEALING_MACHINE_FOOTPRINTS[index]!)) {
      return reject('Repair target unavailable or out of range');
    }
    if (machine.status !== 'broken') return reject('Machine is working');
    if (request.expectedOccupantId !== machine.patientId) return reject('Machine occupant changed');
    if (player.carriedPatientId || player.carriedMedicineId) return reject('Empty hands to repair outage');
    if (this.repair || machine.repairOwnerId) return reject('Repair in progress');
    if (this.releaseRequired.has(playerId)) return reject('Release E before interacting again');
    if (!stationary) return reject('Stop moving to repair the machine');
    const durationMs = characterProfile(player.character).repairMs;
    this.repair = { playerId, machineIndex: index, startedAt: now, lastHeldAt: now, durationMs };
    this.releaseRequired.add(playerId);
    machine.repairOwnerId = playerId;
    machine.repairRemainingMs = durationMs;
    return { ok: true, reason: '' };
  }

  onInput(playerId: string, held: boolean, direction: Direction | null, now: number): void {
    if (!held) {
      if (this.isRepairing(playerId)) this.cancelRepair();
      this.releaseRequired.delete(playerId);
      return;
    }
    if (!this.repair || this.repair.playerId !== playerId) return;
    if (direction) this.cancelRepair();
    else this.repair.lastHeldAt = now;
  }

  nextBoundary(end: number): number {
    return this.repair ? Math.min(end, this.repair.startedAt + this.repair.durationMs,
      this.repair.lastHeldAt + 250) : end;
  }

  advance(now: number, positionFor: (id: string) => Point | undefined,
    facingFor: (id: string) => Direction | undefined, exclusiveEnd = false): void {
    const repair = this.repair;
    if (!repair) return;
    const machine = roomHealingMachines(this.state)[repair.machineIndex]!;
    const player = this.state.players.get(repair.playerId);
    const position = positionFor(repair.playerId);
    const facing = facingFor(repair.playerId);
    const completesAt = repair.startedAt + repair.durationMs;
    const expiresAt = repair.lastHeldAt + 250;
    const completes = completesAt <= now && !(exclusiveEnd && completesAt === now);
    if (!player?.connected || !position || !facing || machine.status !== 'broken' ||
      machine.repairOwnerId !== repair.playerId || player.carriedPatientId || player.carriedMedicineId ||
      !isInteractionReachable(position, facing, HEALING_MACHINE_FOOTPRINTS[repair.machineIndex]!) ||
      (expiresAt <= now && (!completes || expiresAt <= completesAt))) {
      this.cancelRepair();
      return;
    }
    machine.repairRemainingMs = Math.max(0, completesAt - now);
    if (!completes) return;
    const patient = this.state.patients.get(machine.patientId);
    machine.status = !patient || patient.lifecycle !== 'active' ? 'empty' :
      (patient.requiredTreatments & TREATMENT.healing) && !(patient.completedTreatments & TREATMENT.healing) ?
        'treating' : 'completed';
    this.cancelRepair();
  }

  releasePlayer(playerId: string): void {
    if (this.isRepairing(playerId)) this.cancelRepair();
    this.releaseRequired.delete(playerId);
  }

  private cancelRepair(): void {
    if (!this.repair) return;
    const machine = roomHealingMachines(this.state)[this.repair.machineIndex]!;
    machine.repairOwnerId = '';
    machine.repairRemainingMs = 0;
    this.repair = undefined;
  }
}
