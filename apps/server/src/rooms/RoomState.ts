import { schema, t, type SchemaType } from '@colyseus/schema';

export const PlayerState = schema({
  name: t.string(),
  x: t.number(),
  y: t.number(),
  slot: t.uint8(),
  facing: t.string(),
  carriedPatientId: t.string(),
  carriedMedicineId: t.string(),
  character: t.string(),
  ready: t.boolean(),
  connected: t.boolean(),
}, 'PrototypePlayerState');
export type PlayerState = SchemaType<typeof PlayerState>;

export const PatientState = schema({
  id: t.string(),
  species: t.string(),
  requiredTreatments: t.number(),
  completedTreatments: t.number(),
  initialPatienceMs: t.number(),
  remainingPatienceMs: t.number(),
  lifecycle: t.string(),
  location: t.string(),
  slotIndex: t.number(),
  carrierId: t.string(),
  travelKind: t.string(),
  travelElapsedMs: t.number(),
  faintX: t.number(),
  faintY: t.number(),
  faintElevation: t.number(),
}, 'PrototypePatientState');
export type PatientState = SchemaType<typeof PatientState>;

export const MedicineDoseState = schema({
  id: t.string(),
  kind: t.string(),
  location: t.string(),
  carrierId: t.string(),
  slotIndex: t.number(),
}, 'PrototypeMedicineDoseState');
export type MedicineDoseState = SchemaType<typeof MedicineDoseState>;

export const HealingMachineState = schema({
  patientId: t.string(),
  status: t.string(),
  remainingMs: t.number(),
  repairOwnerId: t.string(),
  repairRemainingMs: t.number(),
}, 'PrototypeHealingMachineState');
export type HealingMachineState = SchemaType<typeof HealingMachineState>;

export const RoundResultsState = schema({
  score: t.number(),
  admitted: t.number(),
  discharged: t.number(),
  lost: t.number(),
  unfinished: t.number(),
  stars: t.number(),
  bestStreak: t.number(),
}, 'RoundResultsState');

export const RoomState = schema({
  players: t.map(PlayerState),
  patients: t.map(PatientState),
  medicineDoses: t.map(MedicineDoseState),
  medicineSurfaces: t.array('string'),
  medicinePreparationOwners: t.array('string'),
  medicinePreparationRemainingMs: t.array('number'),
  receptionSlots: t.array('string'),
  waitingSlots: t.array('string'),
  recoveryQueue: t.array('string'),
  healingMachine: HealingMachineState,
  secondHealingMachine: HealingMachineState,
  dischargedCount: t.number(),
  lostCount: t.number(),
  admittedCount: t.number(),
  score: t.number(),
  streak: t.number(),
  bestStreak: t.number(),
  roundRemainingMs: t.number(),
  results: RoundResultsState,
  phase: t.string(),
  hostId: t.string(),
  countdownRemainingMs: t.number(),
  roundId: t.string(),
}, 'PrototypeRoomState');
export type RoomState = SchemaType<typeof RoomState>;

export function roomHealingMachines(state: RoomState): readonly HealingMachineState[] {
  return [state.healingMachine, state.secondHealingMachine];
}

export function resetHealingMachine(machine: HealingMachineState): void {
  machine.patientId = '';
  machine.status = 'empty';
  machine.remainingMs = 0;
  machine.repairOwnerId = '';
  machine.repairRemainingMs = 0;
}
