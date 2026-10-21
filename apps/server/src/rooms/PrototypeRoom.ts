import { ErrorCode, Room, ServerError, type Client } from 'colyseus';
import { normalizeRoomCode, validatePlayerName, type RoomDirectory } from './RoomDirectory.js';

export interface PrivateRoomOptions {
  creationSecret: string;
  creatorKey: string;
  name: string;
}

export function createPrivateRoomType(directory: RoomDirectory, capacity: number, creationSecret: string): new () => Room {
  return class PrivatePrototypeRoom extends Room {
    private code = '';
    private creatorKey = '';
    private readonly names = new Map<string, string>();

    async onCreate(options: Partial<PrivateRoomOptions> = {}): Promise<void> {
      if (options.creationSecret !== creationSecret || !options.creatorKey) {
        throw new ServerError(ErrorCode.AUTH_FAILED, 'Room creation is unavailable');
      }
      this.maxClients = capacity;
      this.creatorKey = options.creatorKey;
      this.code = directory.register(this.roomId);
      await this.setPrivate(true);

      this.onMessage('lobby:sync', (client) => {
        client.send('lobby:players', [...this.names.values()]);
      });
    }

    onAuth(_client: Client, options: Partial<PrivateRoomOptions> & { code?: string } = {}): boolean {
      if (!validatePlayerName(options.name)) {
        throw new ServerError(ErrorCode.AUTH_FAILED, 'Enter a name of 1–16 visible characters');
      }
      if (options.creatorKey === this.creatorKey || normalizeRoomCode(options.code) === this.code) {
        return true;
      }
      throw new ServerError(ErrorCode.AUTH_FAILED, 'Invalid room code');
    }

    onJoin(client: Client, options: PrivateRoomOptions): void {
      this.names.set(client.sessionId, validatePlayerName(options.name)!);
      this.broadcast('lobby:players', [...this.names.values()]);
    }

    onLeave(client: Client): void {
      this.names.delete(client.sessionId);
      this.broadcast('lobby:players', [...this.names.values()]);
    }

    onDispose(): void {
      directory.unregister(this.roomId);
    }
  };
}
