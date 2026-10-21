import { schema, t, type SchemaType } from '@colyseus/schema';

export const PlayerState = schema({
  name: t.string(),
  x: t.number(),
  y: t.number(),
  slot: t.uint8(),
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

export const RoomState = schema({
  players: t.map(PlayerState),
  patients: t.map(PatientState),
  receptionSlots: t.array('string'),
  phase: t.string(),
}, 'PrototypeRoomState');
export type RoomState = SchemaType<typeof RoomState>;
