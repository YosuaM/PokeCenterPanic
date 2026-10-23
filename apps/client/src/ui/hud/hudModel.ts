import { ABILITY_DURATION_MS, ARRIVAL_DIFFICULTY_STAGES, FINAL_CLEARANCE_MS, HEALING_DURATION_MS,
  ROUND_DURATION_MS, TREATMENT, WAITING_SLOT_POSITIONS, characterProfile, patientPatienceRatio,
  patientPresentation, streakBonus, type CharacterAbility, type HealingMachineSnapshot, type PatientRecord,
  type PlayerCharacter, type PlayerPresence } from '@pokecenter/shared';
import { roundClock } from '../../rooms/roundPresentation.js';
import { ABILITY_NAME, CHARACTER_ROLE_TEXT } from '../characterRoles.js';
import type { HudState } from './hudState.js';

export type TreatmentKind = 'healing' | 'burnHeal' | 'antidote';
export type Tone = 'normal' | 'warning' | 'critical' | 'ready' | 'paused';

const TREATMENTS: readonly [number, TreatmentKind, string][] = [
  [TREATMENT.healing, 'healing', 'Healing'],
  [TREATMENT.burnHeal, 'burnHeal', 'Burn Heal'],
  [TREATMENT.antidote, 'antidote', 'Antidote'],
];

export const TREATMENT_NAME: Readonly<Record<TreatmentKind, string>> =
  Object.fromEntries(TREATMENTS.map(([, kind, name]) => [kind, name])) as Record<TreatmentKind, string>;

export const MACHINE_SIDE = ['Left', 'Right'] as const;

export interface ShiftPhase { stage: number; stages: number; label: string }

/** Which arrival stage the shift is in, from the same schedule the server admits patients with. */
export function shiftPhase(remainingMs: number, durationMs = ROUND_DURATION_MS): ShiftPhase {
  const remaining = Number.isFinite(remainingMs) ? Math.max(0, remainingMs) : durationMs;
  const elapsed = Math.max(0, durationMs - remaining);
  const index = Math.max(0, ARRIVAL_DIFFICULTY_STAGES.findIndex((stage) => elapsed < stage.untilMs));
  return { stage: index + 1, stages: ARRIVAL_DIFFICULTY_STAGES.length,
    label: remaining <= FINAL_CLEARANCE_MS ? 'Last call' : ['Calm', 'Busy', 'Rush'][index] ?? 'Rush' };
}

export interface TreatmentNeed { kind: TreatmentKind; done: boolean }

export function treatmentNeeds(patient: Pick<PatientRecord, 'requiredTreatments' | 'completedTreatments'>):
  TreatmentNeed[] {
  return TREATMENTS.filter(([flag]) => patient.requiredTreatments & flag)
    .map(([flag, kind]) => ({ kind, done: Boolean(patient.completedTreatments & flag) }));
}

export interface PatientVitals {
  hp: number;
  patience: number;
  seconds: number;
  tone: Tone;
  ready: boolean;
  critical: boolean;
}

export function patientVitals(patient: PatientRecord): PatientVitals {
  const patience = patientPatienceRatio(patient);
  const ready = patientPresentation(patient).readyForDischarge;
  const critical = patience <= 0.25;
  return {
    hp: patientPresentation(patient).hp,
    patience,
    seconds: Number.isFinite(patient.remainingPatienceMs) ?
      Math.ceil(Math.max(0, patient.remainingPatienceMs) / 1000) : 0,
    tone: critical ? 'critical' : ready ? 'ready' : patience <= 0.5 ? 'warning' : 'normal',
    ready,
    critical,
  };
}

export interface QueueCard extends PatientVitals {
  id: string;
  species: string;
  seat: number;
  arriving: boolean;
  focused: boolean;
  pending: TreatmentKind[];
}

export interface WaitingQueue { cards: QueueCard[]; free: number; seats: number; recovery: number }

/** Seated and reserved patients, most urgent first; empty seats collapse into a count. */
export function waitingQueue(state: Pick<HudState, 'patients' | 'focusedPatientId'>): WaitingQueue {
  const active = state.patients.filter((patient) => patient.lifecycle === 'active');
  const cards = active.filter((patient) => patient.location === 'waiting').map((patient) => ({
    ...patientVitals(patient),
    id: patient.id,
    species: patient.species,
    seat: patient.slotIndex + 1,
    arriving: patient.travelKind === 'arriving',
    focused: patient.id === state.focusedPatientId,
    pending: treatmentNeeds(patient).filter((need) => !need.done).map((need) => need.kind),
  })).sort((a, b) => a.seconds - b.seconds || a.seat - b.seat);
  const seats = WAITING_SLOT_POSITIONS.length;
  return { cards, seats, free: Math.max(0, seats - cards.length),
    recovery: active.filter((patient) => patient.location === 'recovery').length };
}

export interface FocusCard extends PatientVitals {
  id: string;
  species: string;
  needs: TreatmentNeed[];
  status: string;
  statusTone: Tone;
}

/** Care details for the carried or targeted patient. */
export function focusCard(state: Pick<HudState, 'patients' | 'focusedPatientId' | 'machines'>): FocusCard | null {
  const patient = state.patients.find((entry) => entry.lifecycle === 'active' && entry.id === state.focusedPatientId);
  if (!patient) return null;
  const vitals = patientVitals(patient);
  const paused = state.machines.some((machine) => machine.patientId === patient.id && machine.status === 'treating');
  const [status, statusTone]: [string, Tone] = paused ? ['Healing · wait paused', 'paused'] :
    vitals.critical ? [vitals.ready ? 'Critical · discharge now' : 'Critical', 'critical'] :
      vitals.ready ? ['Ready for discharge', 'ready'] :
        vitals.tone === 'warning' ? ['Losing patience', 'warning'] : ['Awaiting care', 'normal'];
  return { ...vitals, id: patient.id, species: patient.species, needs: treatmentNeeds(patient), status,
    statusTone, tone: paused ? 'paused' : vitals.tone };
}

export function characterOf(state: Pick<HudState, 'players'>, id: string | undefined): string | undefined {
  return state.players.find((player) => player.id === id)?.character;
}

/** What a teammate is busy with, from the synchronized clinic state. */
export function playerActivity(state: Pick<HudState, 'players' | 'positions' | 'patients' | 'doses' |
  'machines' | 'medicineOwners'>, id: string): string {
  const player = state.players.find((entry) => entry.id === id);
  if (player?.connected === false) return 'Reconnecting…';
  const position = state.positions.find((entry) => entry.id === id);
  const ability = characterProfile(player?.character).ability;
  if (ability && (position?.abilityRemainingMs ?? 0) > 0) return `Using ${ABILITY_NAME[ability]}`;
  const carried = state.patients.find((patient) => patient.id === position?.carriedPatientId);
  if (carried) return `Carrying ${carried.species}`;
  const dose = state.doses.find((entry) => entry.id === position?.carriedMedicineId);
  if (dose) return `Carrying ${TREATMENT_NAME[dose.kind]}`;
  const mixing = state.medicineOwners.indexOf(id);
  if (mixing >= 0) return `Mixing ${mixing === 0 ? 'Burn Heal' : 'Antidote'}…`;
  if (state.machines.some((machine) => machine.repairOwnerId === id)) return 'Repairing machine';
  return '';
}

export interface CrewMember {
  id: string;
  name: string;
  character: PlayerCharacter | undefined;
  role: string;
  bot: boolean;
  activity: string;
}

export function crewMembers(state: HudState): CrewMember[] {
  return [...state.players].filter((player) => player.id !== state.localId)
    .sort((a, b) => a.slot - b.slot)
    .map((player) => ({ id: player.id, name: player.name, character: player.character,
      role: player.character ? CHARACTER_ROLE_TEXT[player.character].title : 'Staff',
      bot: Boolean(player.bot), activity: playerActivity(state, player.id) }));
}

export type Carrying = { kind: 'patient'; species: string } | { kind: 'medicine'; medicine: TreatmentKind } | null;

export interface LocalCard {
  name: string;
  character: PlayerCharacter | undefined;
  role: string;
  perk: string;
  ability: CharacterAbility | null;
  abilityName: string;
  /** Hold progress of the ability in use, or null when idle. */
  abilityProgress: number | null;
  carrying: Carrying;
}

export function localCard(state: HudState): LocalCard | null {
  const player: PlayerPresence | undefined = state.players.find((entry) => entry.id === state.localId);
  if (!player) return null;
  const position = state.positions.find((entry) => entry.id === player.id);
  const ability = characterProfile(player.character).ability;
  const remaining = position?.abilityRemainingMs ?? 0;
  const carriedPatient = state.patients.find((patient) => patient.id === position?.carriedPatientId);
  const dose = state.doses.find((entry) => entry.id === position?.carriedMedicineId);
  const role = player.character ? CHARACTER_ROLE_TEXT[player.character] : null;
  return {
    name: player.name,
    character: player.character,
    role: role?.title ?? 'Staff',
    perk: role?.perks.split(' · ')[0] ?? '',
    ability,
    abilityName: ability ? ABILITY_NAME[ability] : '',
    abilityProgress: ability && remaining > 0 ?
      Math.min(1, Math.max(0, 1 - remaining / ABILITY_DURATION_MS[ability])) : null,
    carrying: carriedPatient ? { kind: 'patient', species: carriedPatient.species } :
      dose ? { kind: 'medicine', medicine: dose.kind } : null,
  };
}

export interface MachineBadge { state: 'idle' | 'treating' | 'ready' | 'broken' | 'repairing'; progress: number; seconds: number }

export function machineBadge(machine: HealingMachineSnapshot, state: Pick<HudState, 'players'>): MachineBadge {
  const seconds = (ms: number | undefined) => Math.ceil(Math.max(0, ms ?? 0) / 1000);
  const ratio = (remaining: number, total: number) => Math.min(1, Math.max(0, 1 - remaining / total));
  if (machine.status === 'broken') {
    if (!machine.repairOwnerId) return { state: 'broken', progress: 0, seconds: seconds(machine.remainingMs) };
    const repairMs = characterProfile(characterOf(state, machine.repairOwnerId)).repairMs;
    return { state: 'repairing', progress: ratio(machine.repairRemainingMs ?? repairMs, repairMs),
      seconds: seconds(machine.repairRemainingMs ?? repairMs) };
  }
  if (machine.status === 'treating') {
    return { state: 'treating', progress: ratio(machine.remainingMs, machine.durationMs || HEALING_DURATION_MS),
      seconds: seconds(machine.remainingMs) };
  }
  return { state: machine.status === 'completed' ? 'ready' : 'idle', progress: 0, seconds: 0 };
}

export interface PreparationBadge { kind: TreatmentKind; active: boolean; progress: number }

export function preparationBadges(state: Pick<HudState, 'players' | 'medicineOwners' | 'medicineRemainingMs'>):
  PreparationBadge[] {
  return (['burnHeal', 'antidote'] as const).map((kind, index) => {
    const owner = state.medicineOwners[index];
    const durationMs = characterProfile(characterOf(state, owner)).preparationMs;
    return { kind, active: Boolean(owner), progress: owner ? Math.min(1, Math.max(0,
      1 - (state.medicineRemainingMs[index] ?? durationMs) / durationMs)) : 0 };
  });
}

export interface WorldPatient {
  id: string;
  label: string;
  pending: TreatmentKind[];
  ready: boolean;
  tone: Tone;
  patience: number;
  showBar: boolean;
}

/** Compact marker over each visible patient; full details stay in the focus card and queue. */
export function worldPatients(state: Pick<HudState, 'patients'>): WorldPatient[] {
  return state.patients.filter((patient) => patient.lifecycle === 'active' ||
    patient.travelKind === 'leaving' || patient.travelKind === 'fainting').map((patient) => {
    const active = patient.lifecycle === 'active';
    const vitals = patientVitals(patient);
    const label = patient.travelKind === 'fainting' ? 'Fainted' : patient.travelKind === 'leaving' ? 'Bye!' :
      patient.travelKind === 'arriving' ? 'Arriving' : patient.location === 'waiting' ? `#${patient.slotIndex + 1}` :
        vitals.ready ? 'Ready' : `HP ${vitals.hp}`;
    return { id: patient.id, label, ready: active && vitals.ready, tone: active ? vitals.tone : 'normal',
      pending: active ? treatmentNeeds(patient).filter((need) => !need.done).map((need) => need.kind) : [],
      patience: vitals.patience, showBar: active && !patient.travelKind };
  });
}

export interface RoundSummary {
  clock: string;
  urgent: boolean;
  score: number;
  streak: number;
  streakBonus: number;
  discharged: number;
  lost: number;
  phase: ShiftPhase;
}

export function roundSummary(state: Pick<HudState, 'remainingMs' | 'score' | 'streak' | 'discharged' | 'lost'>):
  RoundSummary {
  return { clock: roundClock(state.remainingMs), urgent: state.remainingMs <= FINAL_CLEARANCE_MS,
    score: state.score, streak: state.streak, streakBonus: state.streak >= 2 ? streakBonus(state.streak) : 0,
    discharged: state.discharged, lost: state.lost, phase: shiftPhase(state.remainingMs) };
}
