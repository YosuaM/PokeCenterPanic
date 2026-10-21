import { ErrorCode, Room, ServerError, type Client } from 'colyseus';
import type { PlayerPresence } from '@pokecenter/shared';
import { normalizeRoomCode, validatePlayerName, type RoomDirectory } from './RoomDirectory.js';
import { RoomMovement } from './RoomMovement.js';
import { RoomPatients, seedPrototypePatient } from './RoomPatients.js';
import { PlayerState, RoomState } from './RoomState.js';

export interface PrivateRoomOptions {
  creationSecret: string;
  creatorKey: string;
  name: string;
}

export function createPrivateRoomType(directory: RoomDirectory, capacity: number, creationSecret: string): new () => Room {
  return class PrivatePrototypeRoom extends Room<{ state: RoomState }> {
    private code = '';
    private creatorKey = '';
    private readonly movement = new RoomMovement();
    state = new RoomState();
    private readonly patients = new RoomPatients(this.state);

    private roster(): PlayerPresence[] {
      return [...this.state.players].map(([id, player]) => ({ id, name: player.name, slot: player.slot }));
    }

    async onCreate(options: Partial<PrivateRoomOptions> = {}): Promise<void> {
      if (options.creationSecret !== creationSecret || !options.creatorKey) {
        throw new ServerError(ErrorCode.AUTH_FAILED, 'Room creation is unavailable');
      }
      this.maxClients = capacity;
      this.state.phase = 'running';
      seedPrototypePatient(this.patients);
      this.creatorKey = options.creatorKey;
      this.code = directory.register(this.roomId);
      await this.setPrivate(true);
      this.patchRate = 50;
      this.setTimestep((elapsedMs) => {
        this.movement.advance(elapsedMs, performance.now());
        for (const [id, player] of this.state.players) {
          const position = this.movement.position(id);
          if (!position) continue;
          player.x = position.x;
          player.y = position.y;
        }
      }, 50);

      this.onMessage('lobby:sync', (client) => {
        client.send('lobby:players', this.roster());
      });
      this.onMessage('player:input', (client, input: unknown) => {
        this.movement.accept(client.sessionId, input, performance.now());
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
      const { position, slot } = this.movement.add(client.sessionId);
      const player = new PlayerState();
      player.name = validatePlayerName(options.name)!;
      player.x = position.x;
      player.y = position.y;
      player.slot = slot;
      this.state.players.set(client.sessionId, player);
      this.broadcast('lobby:players', this.roster());
    }

    onLeave(client: Client): void {
      this.movement.remove(client.sessionId);
      this.state.players.delete(client.sessionId);
      this.broadcast('lobby:players', this.roster());
    }

    onDispose(): void {
      directory.unregister(this.roomId);
    }
  };
}
