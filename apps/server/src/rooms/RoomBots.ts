import { CALM_PATIENCE_RATIO, MEDICINE_KINDS, SPAWN_POINTS, TREATMENT, characterProfile, isInteractionReachable,
  patientPatienceRatio, patientPresentation, type CharacterRole, type Direction, type MedicineKind,
  type PatientInteractionResult, type Point } from '@pokecenter/shared';
import { distanceField, reachCells, steer, targetGeometry, warmNavigation, type DistanceField } from './botNavigation.js';
import type { RoomCommands } from './RoomCommands.js';
import type { RoomLobby } from './RoomLobby.js';
import type { RoomMovement } from './RoomMovement.js';
import { PlayerState, roomHealingMachines, type PatientState, type RoomState } from './RoomState.js';

type TaskType = 'repair' | 'machinePickup' | 'discharge' | 'heal' | 'prepare' | 'collectDose' | 'calm';
type Channel = 'patient' | 'medicine' | 'ability';
type Hold = 'none' | 'interact' | 'ability';

interface Goal {
  /** Claim shared with other bots so two bots never chase the same work. */
  claim: string;
  targetId: string;
  expectedOccupantId: string;
  channel: Channel;
  hold: Hold;
  done?: () => boolean;
}

interface Mind {
  sequence: number;
  goal?: Goal;
  holding: Hold;
  holdStartedAt: number;
  path: Point[];
  pathTarget: string;
  decidedAt: number;
  busyUntil: number;
  lastPosition: Point;
  lastProgressAt: number;
  cooldowns: Map<string, number>;
  calmed: Set<string>;
  lastDirection: Direction | null;
}

/** Lower is more urgent; each role favors its specialty but helps with everything. */
const PRIORITY: Readonly<Record<CharacterRole, Readonly<Record<TaskType, number>>>> = {
  nurse: { repair: 4, machinePickup: 1, discharge: 2, heal: 0, prepare: 3, collectDose: 3, calm: 99 },
  pharmacy: { repair: 4, machinePickup: 3, discharge: 3, heal: 3, prepare: 0, collectDose: 0, calm: 1 },
  porter: { repair: 0, machinePickup: 1, discharge: 1, heal: 0, prepare: 3, collectDose: 3, calm: 99 },
  allRounder: { repair: 2, machinePickup: 0, discharge: 0, heal: 1, prepare: 2, collectDose: 2, calm: 99 },
};
const PRIORITY_WEIGHT = 6 * 48;
const HOME: Readonly<Record<CharacterRole, Point>> = {
  nurse: { x: 200, y: 136 }, pharmacy: { x: 480, y: 112 }, porter: { x: 760, y: 136 }, allRounder: { x: 480, y: 200 },
};
const REACTION_MS = 250;
const RETRY_MS = 1_500;
const STUCK_MS = 1_200;
const MAX_HOLD_MS = 5_000;

export class RoomBots {
  private readonly minds = new Map<string, Mind>();
  private nextBot = 1;

  constructor(private readonly state: RoomState, private readonly movement: RoomMovement,
    private readonly lobby: RoomLobby, private readonly commands: RoomCommands) {}

  ids(): string[] { return [...this.minds.keys()]; }

  /** Adds a ready bot with the first free Pokémon; the caller checks capacity and host rights. */
  add(): string | null {
    const character = this.lobby.freeCharacters()[0];
    if (!character || this.state.players.size >= SPAWN_POINTS.length) return null;
    const id = `bot-${this.nextBot++}`;
    const { position, slot } = this.movement.add(id);
    const player = new PlayerState();
    player.name = `Bot ${slot + 1}`;
    player.x = position.x;
    player.y = position.y;
    player.slot = slot;
    player.facing = 'up';
    player.carriedPatientId = '';
    player.carriedMedicineId = '';
    player.character = character;
    player.ready = true;
    player.connected = true;
    player.bot = true;
    player.abilityPatientId = '';
    player.abilityRemainingMs = 0;
    this.state.players.set(id, player);
    this.lobby.addBot(id);
    this.minds.set(id, newMind(position));
    warmNavigation();
    return id;
  }

  remove(id: string): boolean {
    if (!this.minds.delete(id)) return false;
    this.commands.release(id);
    this.movement.remove(id);
    this.state.players.delete(id);
    this.lobby.removeBot(id);
    return true;
  }

  removeAll(): void {
    for (const id of this.ids()) this.remove(id);
  }

  resetRound(): void {
    for (const [id, mind] of this.minds) {
      Object.assign(mind, newMind(this.movement.position(id) ?? { x: 0, y: 0 }), { sequence: mind.sequence });
    }
  }

  advance(now: number): void {
    if (this.state.phase !== 'running') return;
    for (const [id, mind] of this.minds) this.think(id, mind, now);
  }

  private think(id: string, mind: Mind, now: number): void {
    const player = this.state.players.get(id);
    const position = this.movement.position(id);
    if (!player || !position) return;
    if (mind.holding !== 'none') {
      const goal = mind.goal;
      const finished = !goal || goal.done?.() || now - mind.holdStartedAt > MAX_HOLD_MS;
      if (finished) {
        mind.holding = 'none';
        mind.goal = undefined;
        mind.busyUntil = now + REACTION_MS;
        this.input(id, mind, null, now);
      } else {
        this.input(id, mind, null, now, mind.holding === 'interact', mind.holding === 'ability');
      }
      return;
    }
    if (now < mind.busyUntil) {
      this.input(id, mind, null, now);
      return;
    }
    if (!mind.goal || now - mind.decidedAt > 600) {
      const field = distanceField(position);
      mind.goal = this.decide(id, player, field, now) ?? undefined;
      mind.decidedAt = now;
      if (mind.goal?.targetId !== mind.pathTarget) {
        mind.pathTarget = mind.goal?.targetId ?? 'home';
        const home = HOME[characterProfile(player.character).role];
        mind.path = field.pathTo(mind.goal ? reachCells(mind.goal.targetId) : new Set([`${home.x},${home.y}`])) ?? [];
      }
    }
    const goal = mind.goal;
    const geometry = goal && targetGeometry(goal.targetId);
    if (goal && geometry && isInteractionReachable(position, this.movement.facing(id) ?? 'down', geometry)) {
      this.input(id, mind, null, now);
      this.act(id, mind, goal, now);
      return;
    }
    const direction = steer(position, mind.path, mind.lastDirection);
    // Only time a stall while the bot is actually trying to walk.
    if (!mind.lastDirection) mind.lastProgressAt = now;
    mind.lastDirection = direction;
    if (Math.hypot(position.x - mind.lastPosition.x, position.y - mind.lastPosition.y) > 1) {
      mind.lastPosition = { ...position };
      mind.lastProgressAt = now;
    } else if (direction && now - mind.lastProgressAt > STUCK_MS) {
      if (goal) mind.cooldowns.set(goal.claim, now + RETRY_MS);
      mind.goal = undefined;
      mind.pathTarget = '';
      mind.lastProgressAt = now;
    }
    if (!direction && goal) {
      // Arrived at the planned cell without reach (state changed); plan again.
      mind.decidedAt = 0;
      mind.pathTarget = '';
    }
    this.input(id, mind, direction, now);
  }

  private act(id: string, mind: Mind, goal: Goal, now: number): void {
    const request = { targetId: goal.targetId, expectedOccupantId: goal.expectedOccupantId,
      sequence: ++mind.sequence, roundId: this.state.roundId };
    const result: PatientInteractionResult = goal.channel === 'medicine' ?
      this.commands.medicineInteract(id, request, now) : goal.channel === 'ability' ?
        this.commands.ability(id, request, now) : this.commands.patientInteract(id, request, now);
    if (!result.ok) {
      mind.cooldowns.set(goal.claim, now + RETRY_MS);
      mind.goal = undefined;
      mind.pathTarget = '';
      mind.busyUntil = now + REACTION_MS;
      return;
    }
    if (goal.hold === 'none') {
      mind.goal = undefined;
      mind.pathTarget = '';
      mind.busyUntil = now + REACTION_MS;
      return;
    }
    mind.holding = goal.hold;
    mind.holdStartedAt = now;
    if (goal.hold === 'ability') mind.calmed.add(goal.expectedOccupantId);
  }

  private input(id: string, mind: Mind, direction: Direction | null, now: number,
    interactHeld = false, abilityHeld = false): void {
    this.commands.input(id, { direction, interactHeld, abilityHeld, sequence: ++mind.sequence,
      roundId: this.state.roundId }, now);
  }

  private claimedByOthers(id: string): Set<string> {
    const claims = new Set<string>();
    for (const [other, mind] of this.minds) if (other !== id && mind.goal) claims.add(mind.goal.claim);
    return claims;
  }

  private decide(id: string, player: PlayerState, field: DistanceField, now: number): Goal | null {
    const mind = this.minds.get(id)!;
    const claimed = this.claimedByOthers(id);
    const available = (goal: Goal): boolean => !claimed.has(goal.claim) &&
      (mind.cooldowns.get(goal.claim) ?? 0) <= now && field.distanceTo(reachCells(goal.targetId)) < Infinity;
    const nearest = (goals: Goal[]): Goal | null => goals.filter(available)
      .sort((a, b) => field.distanceTo(reachCells(a.targetId)) - field.distanceTo(reachCells(b.targetId)))[0] ?? null;

    if (player.carriedPatientId) return nearest(this.carryPatientGoals(player.carriedPatientId));
    if (player.carriedMedicineId) return nearest(this.carryDoseGoals(player.carriedMedicineId));

    const role = characterProfile(player.character).role;
    const options: { goal: Goal; score: number }[] = [];
    for (const [type, goal] of this.emptyHandGoals(id, player)) {
      if (!available(goal)) continue;
      const priority = PRIORITY[role][type];
      if (priority >= 99) continue;
      options.push({ goal, score: priority * PRIORITY_WEIGHT + field.distanceTo(reachCells(goal.targetId)) });
    }
    options.sort((a, b) => a.score - b.score);
    return options[0]?.goal ?? null;
  }

  private carryPatientGoals(patientId: string): Goal[] {
    const patient = this.state.patients.get(patientId);
    if (!patient) return [];
    const tap = (claim: string, targetId: string, expectedOccupantId = ''): Goal =>
      ({ claim, targetId, expectedOccupantId, channel: 'patient', hold: 'none' });
    if (isReady(patient)) return [tap(`discharge:${patient.id}`, 'discharge', patient.id)];
    const machines = needsHealing(patient) ? roomHealingMachines(this.state)
      .map((machine, index) => machine.status === 'empty' ? tap(`machine:${index}`, `healing:${index}`) : null)
      .filter((goal): goal is Goal => goal !== null) : [];
    if (machines.length) return machines;
    return [...this.state.waitingSlots].map((occupant, index) => occupant ? null : tap(`seat:${index}`, `waiting:${index}`))
      .filter((goal): goal is Goal => goal !== null);
  }

  private carryDoseGoals(doseId: string): Goal[] {
    const dose = this.state.medicineDoses.get(doseId);
    if (!dose) return [];
    const flag = dose.kind === 'burnHeal' ? TREATMENT.burnHeal : TREATMENT.antidote;
    const goals: Goal[] = [];
    for (const { patient, targetId } of this.stationaryPatients(true)) {
      if (pending(patient) & flag) {
        goals.push({ claim: `medicate:${patient.id}`, targetId: `medicine:apply:${targetId}`,
          expectedOccupantId: patient.id, channel: 'medicine', hold: 'none' });
      }
    }
    if (goals.length) return goals;
    const surfaces: Goal[] = [];
    [...this.state.medicineSurfaces].forEach((occupant, index) => {
      if (!occupant) surfaces.push({ claim: `surface:${index}`, targetId: `medicine:surface:${index}`,
        expectedOccupantId: '', channel: 'medicine', hold: 'none' });
    });
    return surfaces.length ? surfaces : [{ claim: `disposal:${doseId}`, targetId: 'medicine:disposal',
      expectedOccupantId: doseId, channel: 'medicine', hold: 'none' }];
  }

  private emptyHandGoals(id: string, player: PlayerState): [TaskType, Goal][] {
    const goals: [TaskType, Goal][] = [];
    const machines = roomHealingMachines(this.state);
    const profile = characterProfile(player.character);
    for (const [index, machine] of machines.entries()) {
      if (machine.status === 'broken' && !machine.repairOwnerId) {
        goals.push(['repair', { claim: `machine:${index}`, targetId: `healing:${index}`,
          expectedOccupantId: machine.patientId, channel: 'patient', hold: 'interact',
          done: () => machine.status !== 'broken' || machine.repairOwnerId !== id }]);
      }
      const patient = this.state.patients.get(machine.patientId);
      if (machine.status === 'completed' && patient && isReady(patient)) {
        goals.push(['machinePickup', { claim: `patient:${patient.id}`, targetId: `healing:${index}`,
          expectedOccupantId: patient.id, channel: 'patient', hold: 'none' }]);
      }
    }
    const freeMachines = machines.filter((machine) => machine.status === 'empty').length;
    for (const { patient, targetId } of this.stationaryPatients(false)) {
      const pickup = { claim: `patient:${patient.id}`, targetId, expectedOccupantId: patient.id,
        channel: 'patient' as const, hold: 'none' as const };
      if (isReady(patient)) {
        goals.push(['discharge', pickup]);
        continue;
      }
      if (needsHealing(patient)) {
        if (profile.ability === 'softBoiled') {
          goals.push(['heal', { claim: `patient:${patient.id}`, targetId, expectedOccupantId: patient.id,
            channel: 'ability', hold: 'ability', done: () => !needsHealing(patient) || player.abilityPatientId === '' }]);
        } else if (freeMachines > 0) {
          goals.push(['heal', pickup]);
        }
      }
      const mind = this.minds.get(id)!;
      if (profile.ability === 'calm' && !mind.calmed.has(patient.id) &&
        patientPatienceRatio(patient) < 1 - CALM_PATIENCE_RATIO - 0.3) {
        goals.push(['calm', { claim: `calm:${patient.id}`, targetId, expectedOccupantId: patient.id,
          channel: 'ability', hold: 'ability', done: () => player.abilityPatientId === '' }]);
      }
    }
    for (const [index, kind] of MEDICINE_KINDS.entries()) {
      const demand = this.medicineDemand(kind);
      if (demand > 0 && !this.state.medicinePreparationOwners[index]) {
        goals.push(['prepare', { claim: `prep:${index}`, targetId: `medicine:prep:${index}`, expectedOccupantId: '',
          channel: 'medicine', hold: 'interact', done: () => player.carriedMedicineId !== '' ||
            this.state.medicinePreparationOwners[index] !== id }]);
      }
      for (const [surface, doseId] of [...this.state.medicineSurfaces].entries()) {
        const dose = this.state.medicineDoses.get(doseId);
        if (dose?.kind === kind && demand > -1) {
          goals.push(['collectDose', { claim: `dose:${dose.id}`, targetId: `medicine:surface:${surface}`,
            expectedOccupantId: dose.id, channel: 'medicine', hold: 'none' }]);
        }
      }
    }
    return goals;
  }

  /** Patients waiting for this medicine minus doses already prepared, carried or being prepared. */
  private medicineDemand(kind: MedicineKind): number {
    const flag = kind === 'burnHeal' ? TREATMENT.burnHeal : TREATMENT.antidote;
    const patients = [...this.state.patients.values()].filter((patient) => patient.lifecycle === 'active' &&
      (pending(patient) & flag)).length;
    const doses = [...this.state.medicineDoses.values()].filter((dose) => dose.kind === kind &&
      (dose.location === 'carrier' || dose.location === 'surface')).length;
    const preparing = this.state.medicinePreparationOwners[MEDICINE_KINDS.indexOf(kind)] ? 1 : 0;
    return patients - doses - preparing;
  }

  /** Active patients a bot can reach in place, with the target that exposes each one. */
  private stationaryPatients(includeMachines: boolean): { patient: PatientState; targetId: string }[] {
    const result: { patient: PatientState; targetId: string }[] = [];
    const add = (patientId: string, targetId: string) => {
      const patient = this.state.patients.get(patientId);
      if (patient?.lifecycle === 'active' && !patient.travelKind) result.push({ patient, targetId });
    };
    [...this.state.receptionSlots].forEach((id, index) => id && add(id, `reception:${index}`));
    [...this.state.waitingSlots].forEach((id, index) => id && add(id, `waiting:${index}`));
    if (this.state.recoveryQueue[0]) add(this.state.recoveryQueue[0], 'recovery');
    if (includeMachines) {
      roomHealingMachines(this.state).forEach((machine, index) => {
        if (machine.status === 'completed' && machine.patientId) add(machine.patientId, `healing:${index}`);
      });
    }
    return result;
  }
}

function newMind(position: Point): Mind {
  return { sequence: 0, holding: 'none', holdStartedAt: 0, path: [], pathTarget: '', decidedAt: 0, busyUntil: 0,
    lastPosition: { ...position }, lastProgressAt: 0, cooldowns: new Map(), calmed: new Set(), lastDirection: null };
}

function pending(patient: PatientState): number {
  return patient.requiredTreatments & ~patient.completedTreatments;
}

function isReady(patient: PatientState): boolean {
  return patient.lifecycle === 'active' && patientPresentation({ requiredTreatments: patient.requiredTreatments,
    completedTreatments: patient.completedTreatments, lifecycle: 'active',
    initialPatienceMs: patient.initialPatienceMs, remainingPatienceMs: patient.remainingPatienceMs }).readyForDischarge;
}

function needsHealing(patient: PatientState): boolean {
  return Boolean(pending(patient) & TREATMENT.healing);
}
