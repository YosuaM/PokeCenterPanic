import { randomUUID } from 'node:crypto';
import { createEndpoint, createRouter, defineRoom, defineServer, matchMaker, type Server } from 'colyseus';
import { PROJECT_INFO, type ProjectInfo } from '@pokecenter/shared';
import { RoomDirectory, normalizeRoomCode, validatePlayerName } from './rooms/RoomDirectory.js';
import { createPrivateRoomType } from './rooms/PrototypeRoom.js';

const project: ProjectInfo = PROJECT_INFO;

export function createGameServer({ capacity = 2 }: { capacity?: number } = {}): Server {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 4) {
    throw new Error('Room capacity must be an integer between 1 and 4');
  }

  const directory = new RoomDirectory();
  const creationSecret = randomUUID();
  const RoomType = createPrivateRoomType(directory, capacity, creationSecret);

  const createRoom = createEndpoint('/api/rooms', { method: 'POST' }, async (ctx) => {
    const name = validatePlayerName(ctx.body?.name);
    if (!name) return Response.json({ error: 'Enter a name of 1–16 visible characters' }, { status: 400 });

    const reservation = await matchMaker.create(project.roomName, {
      name,
      creationSecret,
      creatorKey: randomUUID(),
    });
    const code = directory.codeFor(reservation.roomId);
    if (!code) return Response.json({ error: 'Room is unavailable' }, { status: 503 });
    return Response.json({ code, reservation });
  });

  const joinRoom = createEndpoint('/api/rooms/:code/join', { method: 'POST' }, async (ctx) => {
    const name = validatePlayerName(ctx.body?.name);
    if (!name) return Response.json({ error: 'Enter a name of 1–16 visible characters' }, { status: 400 });

    const code = normalizeRoomCode(ctx.params.code);
    const roomId = code && directory.roomIdFor(code);
    if (!roomId) return Response.json({ error: 'Invalid room code' }, { status: 404 });

    try {
      const reservation = await matchMaker.joinById(roomId, { name, code });
      return Response.json({ code, reservation });
    } catch {
      const [room] = await matchMaker.query({ roomId });
      if (!room || !directory.roomIdFor(code)) {
        return Response.json({ error: 'Invalid room code' }, { status: 404 });
      }
      if (room.locked || room.clients >= room.maxClients) {
        return Response.json({ error: 'Room is full' }, { status: 409 });
      }
      return Response.json({ error: 'Room is unavailable' }, { status: 503 });
    }
  });

  return defineServer({
    rooms: {
      [project.roomName]: defineRoom(RoomType),
    },
    routes: createRouter({ createRoom, joinRoom }),
  });
}

export function resolvePort(value: string | undefined): number {
  if (value === undefined) return 2567;

  const port = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

export function resolveCapacity(value: string | undefined): number {
  if (value === undefined) return 2;
  if (!/^[1-4]$/.test(value)) {
    throw new Error('ROOM_CAPACITY must be an integer between 1 and 4');
  }
  return Number(value);
}
