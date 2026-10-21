import { ErrorCode, Room, ServerError, type Client } from 'colyseus';
import { PLAYER_CHARACTERS, type PlayerCharacter, type PlayerInput, type PlayerPresence } from '@pokecenter/shared';
import { normalizeRoomCode, validatePlayerName, type RoomDirectory } from './RoomDirectory.js';
import { RoomMovement } from './RoomMovement.js';
import { RoomLobby, type LobbyResult } from './RoomLobby.js';
import { RoomPatients, seedPrototypePatient } from './RoomPatients.js';
import { RoomMedicine, isMedicineInteractionRequest } from './RoomMedicine.js';
import { PlayerState, RoomState } from './RoomState.js';

export interface PrivateRoomOptions {
  creationSecret: string;
  creatorKey: string;
  name: string;
}

export function createPrivateRoomType(directory: RoomDirectory, capacity: number, creationSecret: string,
  countdownMs = 3_000, reconnectMs = 30_000, emptyRoomMs = 60_000): new () => Room {
  return class PrivatePrototypeRoom extends Room<{ state: RoomState }> {
    private code = '';
    private creatorKey = '';
    private readonly reconnectUntil = new Map<string, number>();
    private emptyRoomTimer: ReturnType<typeof setTimeout> | undefined;
    private lastReservationBroadcastAt = 0;
    private readonly movement = new RoomMovement();
    state = new RoomState();
    private readonly patients = new RoomPatients(this.state);
    private readonly medicine = new RoomMedicine(this.state);
    private readonly lobby = new RoomLobby(this.state, countdownMs);

    private roster(): PlayerPresence[] {
      return [...this.state.players].map(([id, player]) => ({ id, name: player.name, slot: player.slot,
        character: PLAYER_CHARACTERS.includes(player.character as PlayerCharacter) ?
          player.character as PlayerCharacter : undefined, ready: player.ready, connected: player.connected,
        reconnectRemainingMs: player.connected ? undefined :
          Math.max(0, (this.reconnectUntil.get(id) ?? 0) - Date.now()) }));
    }

    private lastSequenceFor(playerId: string): number {
      return Math.max(this.lobby.lastSequence(playerId), this.movement.lastSequence(playerId));
    }

    private updateEmptyRoomDeadline(): void {
      if (this.clients.length) {
        if (this.emptyRoomTimer) clearTimeout(this.emptyRoomTimer);
        this.emptyRoomTimer = undefined;
      } else if (!this.emptyRoomTimer) {
        this.emptyRoomTimer = setTimeout(() => void this.disconnect(), emptyRoomMs);
      }
    }

    async onCreate(options: Partial<PrivateRoomOptions> = {}): Promise<void> {
      if (options.creationSecret !== creationSecret || !options.creatorKey) {
        throw new ServerError(ErrorCode.AUTH_FAILED, 'Room creation is unavailable');
      }
      this.maxClients = capacity;
      this.autoDispose = false;
      this.creatorKey = options.creatorKey;
      this.code = directory.register(this.roomId);
      await this.setPrivate(true);
      this.patchRate = 50;
      this.setTimestep((elapsedMs) => {
        const now = performance.now();
        if (this.lobby.advance(now)) {
          seedPrototypePatient(this.patients);
          directory.setPhase(this.roomId, 'running');
        }
        if (this.state.phase === 'running') {
          this.medicine.advance(now, (id) => this.movement.position(id),
            (id) => this.movement.facing(id));
          this.movement.advance(elapsedMs, now);
          this.patients.advance(elapsedMs);
        }
        if (this.reconnectUntil.size && Date.now() - this.lastReservationBroadcastAt >= 1_000) {
          this.lastReservationBroadcastAt = Date.now();
          this.broadcast('lobby:players', this.roster());
        }
        for (const [id, player] of this.state.players) {
          const position = this.movement.position(id);
          if (!position) continue;
          player.x = position.x;
          player.y = position.y;
          player.facing = this.movement.facing(id)!;
        }
      }, 50);

      this.onMessage('lobby:sync', (client) => {
        client.send('lobby:players', this.roster());
        client.send('room:resume', { lastSequence: this.lastSequenceFor(client.sessionId) });
      });
      const respond = (client: Client, result: LobbyResult, rosterChanged = false) => {
        client.send('lobby:result', result);
        if (result.ok && rosterChanged) this.broadcast('lobby:players', this.roster());
      };
      this.onMessage('player:select', (client, value: unknown) => {
        respond(client, this.lobby.select(client.sessionId, value), true);
      });
      this.onMessage('player:ready', (client, value: unknown) => {
        respond(client, this.lobby.ready(client.sessionId, value), true);
      });
      this.onMessage('game:start', (client, value: unknown) => {
        const result = this.lobby.start(client.sessionId, value, performance.now());
        if (result.ok) directory.setPhase(this.roomId, 'countdown');
        respond(client, result);
      });
      this.onMessage('player:input', (client, input: unknown) => {
        if (this.state.phase === 'running') {
          const now = performance.now();
          if (this.movement.accept(client.sessionId, input, now, this.state.roundId)) {
            const accepted = input as PlayerInput;
            this.medicine.onInput(client.sessionId, accepted.interactHeld === true,
              accepted.direction, now);
          }
        }
      });
      this.onMessage('medicine:interact', (client, input: unknown) => {
        const playerId = client.sessionId;
        const now = performance.now();
        const player = this.state.players.get(playerId);
        const position = this.movement.position(playerId);
        const facing = this.movement.facing(playerId);
        if (this.state.phase !== 'running' || !player || !position || !facing ||
          !isMedicineInteractionRequest(input) ||
          !this.movement.acceptAction(playerId, input.sequence, input.roundId, this.state.roundId)) {
          client.send('medicine:result', { ok: false, reason: 'Interaction unavailable or stale' });
          return;
        }
        client.send('medicine:result', this.medicine.interact(playerId, input, position, facing,
          now, this.movement.isStationary(playerId, now)));
      });
      this.onMessage('patient:interact', (client, input: unknown) => {
        const player = this.state.players.get(client.sessionId);
        const position = this.movement.position(client.sessionId);
        const facing = this.movement.facing(client.sessionId);
        if (this.state.phase !== 'running' || !player || !position || !facing ||
          player.carriedMedicineId || this.medicine.isPreparing(client.sessionId)) {
          client.send('patient:result', { ok: false, reason: 'Interaction unavailable' });
          return;
        }
        client.send('patient:result', this.patients.interact(client.sessionId, input, position, facing));
      });
    }

    onAuth(_client: Client, options: Partial<PrivateRoomOptions> & { code?: string } = {}): boolean {
      if (!validatePlayerName(options.name)) {
        throw new ServerError(ErrorCode.AUTH_FAILED, 'Enter a name of 1–16 visible characters');
      }
      if (this.state.phase !== 'lobby') {
        throw new ServerError(ErrorCode.AUTH_FAILED, this.state.phase === 'countdown' ?
          'Countdown in progress' : 'Game in progress');
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
      player.facing = 'up';
      player.carriedPatientId = '';
      player.carriedMedicineId = '';
      player.character = '';
      player.ready = false;
      player.connected = true;
      this.state.players.set(client.sessionId, player);
      this.lobby.joined(client.sessionId);
      this.updateEmptyRoomDeadline();
      this.broadcast('lobby:players', this.roster());
    }

    onDrop(client: Client): void {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      this.patients.releaseCarrier(client.sessionId);
      this.medicine.releaseCarrier(client.sessionId);
      this.movement.suspend(client.sessionId);
      player.connected = false;
      this.reconnectUntil.set(client.sessionId, Date.now() + reconnectMs);
      this.lobby.departed(client.sessionId, true);
      directory.setPhase(this.roomId, this.lobby.phase());
      this.broadcast('lobby:players', this.roster());
      this.updateEmptyRoomDeadline();
      this.allowReconnection(client, reconnectMs / 1000).catch(() => undefined);
    }

    onReconnect(client: Client): void {
      const player = this.state.players.get(client.sessionId);
      const position = this.movement.resume(client.sessionId);
      if (!player || !position) throw new Error('Reserved seat is unavailable');
      player.x = position.x;
      player.y = position.y;
      player.facing = 'up';
      player.carriedPatientId = '';
      player.carriedMedicineId = '';
      player.ready = false;
      player.connected = true;
      this.reconnectUntil.delete(client.sessionId);
      this.lobby.joined(client.sessionId);
      this.updateEmptyRoomDeadline();
      client.send('room:resume', { lastSequence: this.lastSequenceFor(client.sessionId) });
      this.broadcast('lobby:players', this.roster());
    }

    onLeave(client: Client): void {
      this.patients.releaseCarrier(client.sessionId);
      this.medicine.releaseCarrier(client.sessionId);
      this.movement.remove(client.sessionId);
      this.state.players.delete(client.sessionId);
      this.reconnectUntil.delete(client.sessionId);
      this.lobby.departed(client.sessionId);
      if (!this.state.players.size) {
        this.lobby.resetEmpty();
        this.patients.reset();
        this.medicine.reset();
      }
      directory.setPhase(this.roomId, this.lobby.phase());
      this.broadcast('lobby:players', this.roster());
      this.updateEmptyRoomDeadline();
    }

    onDispose(): void {
      if (this.emptyRoomTimer) clearTimeout(this.emptyRoomTimer);
      directory.unregister(this.roomId);
    }
  };
}
