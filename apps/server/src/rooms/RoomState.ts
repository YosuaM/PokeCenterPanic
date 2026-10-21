import { schema, t, type SchemaType } from '@colyseus/schema';

export const PlayerState = schema({
  name: t.string(),
  x: t.number(),
  y: t.number(),
  slot: t.uint8(),
  facing: t.string(),
  carriedPatientId: t.string(),
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
}, 'PrototypePatientState');
export type PatientState = SchemaType<typeof PatientState>;

export const HealingMachineState = schema({
  patientId: t.string(),
  status: t.string(),
  remainingMs: t.number(),
}, 'PrototypeHealingMachineState');
export type HealingMachineState = SchemaType<typeof HealingMachineState>;

export const RoomState = schema({
  players: t.map(PlayerState),
  patients: t.map(PatientState),
  receptionSlots: t.array('string'),
  waitingSlots: t.array('string'),
  recoveryQueue: t.array('string'),
  healingMachine: HealingMachineState,
  dischargedCount: t.number(),
  phase: t.string(),
}, 'PrototypeRoomState');
export type RoomState = SchemaType<typeof RoomState>;
