import { defineRoom, defineServer } from 'colyseus';
import { PROJECT_INFO, type ProjectInfo } from '@pokecenter/shared';
import { PrototypeRoom } from './rooms/PrototypeRoom.js';

const project: ProjectInfo = PROJECT_INFO;

export function createGameServer() {
  return defineServer({
    rooms: {
      [project.roomName]: defineRoom(PrototypeRoom),
    },
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
