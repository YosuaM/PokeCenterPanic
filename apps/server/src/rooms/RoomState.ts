import { schema, t, type SchemaType } from '@colyseus/schema';

export const PlayerState = schema({
  name: t.string(),
  x: t.number(),
  y: t.number(),
  slot: t.uint8(),
}, 'PrototypePlayerState');
export type PlayerState = SchemaType<typeof PlayerState>;

export const RoomState = schema({ players: t.map(PlayerState) }, 'PrototypeRoomState');
export type RoomState = SchemaType<typeof RoomState>;
