import { ErrorCode, Room, ServerError, type Client } from 'colyseus';
import { PLAYER_CHARACTERS, ROUND_DURATION_MS, walkingSpeedMultiplier, type PlayerCharacter,
  type PlayerPresence } from '@pokecenter/shared';
import { normalizeRoomCode, validatePlayerName, type RoomDirectory } from './RoomDirectory.js';
import { RoomMovement } from './RoomMovement.js';
import { RoomLobby, type LobbyResult } from './RoomLobby.js';
import { RoomPatients } from './RoomPatients.js';
import { RoomArrivals } from './RoomArrivals.js';
import { RoomRound } from './RoomRound.js';
import { RoomIncidents } from './RoomIncidents.js';
import { RoomMedicine } from './RoomMedicine.js';
import { RoomAbilities } from './RoomAbilities.js';
import { RoomCommands } from './RoomCommands.js';
import { RoomBots } from './RoomBots.js';
import { PlayerState, RoomState } from './RoomState.js';

export interface PrivateRoomOptions {
  creationSecret: string;
  creatorKey: string;
  name: string;
}

export function createPrivateRoomType(directory: RoomDirectory, capacity: number, creationSecret: string,
  countdownMs = 3_000, reconnectMs = 30_000, emptyRoomMs = 60_000,
  roundDurationMs = ROUND_DURATION_MS): new () => Room {
  return class PrivatePrototypeRoom extends Room<{ state: RoomState }> {
    private code = '';
    private creatorKey = '';
    private readonly reconnectUntil = new Map<string, number>();
    private emptyRoomTimer: ReturnType<typeof setTimeout> | undefined;
    private lastReservationBroadcastAt = 0;
    state = new RoomState();
    private readonly movement = new RoomMovement((id) => {
      const player = this.state.players.get(id);
      return walkingSpeedMultiplier(player?.character, Boolean(player?.carriedPatientId));
    });
    private readonly patients = new RoomPatients(this.state);
    private readonly arrivals = new RoomArrivals(this.state, this.patients, Math.random, roundDurationMs);
    private readonly medicine = new RoomMedicine(this.state,
      (event) => this.broadcast('medicine:discarded', event));
    private readonly lobby = new RoomLobby(this.state, countdownMs);
    private readonly incidents = new RoomIncidents(this.state);
    private readonly abilities = new RoomAbilities(this.state);
    private readonly round = new RoomRound(this.state, this.patients, this.medicine,
      this.movement, roundDurationMs, this.incidents, this.abilities);
    private readonly commands = new RoomCommands(this.state, this.movement, this.patients, this.medicine,
      this.incidents, this.abilities);
    private readonly bots = new RoomBots(this.state, this.movement, this.lobby, this.commands);

    private advanceRound(now: number): void {
      this.round.advance(now);
      directory.setPhase(this.roomId, this.lobby.phase());
    }

    private resetGameplay(): void {
      this.patients.reset();
      this.medicine.reset();
      this.arrivals.reset();
      this.round.reset();
      this.movement.resetRound();
      this.bots.resetRound();
      for (const [id, player] of this.state.players) {
        const position = this.movement.position(id);
        if (position) Object.assign(player, position);
        player.facing = 'up';
      }
    }

    private roster(): PlayerPresence[] {
      return [...this.state.players].map(([id, player]) => ({ id, name: player.name, slot: player.slot,
        character: PLAYER_CHARACTERS.includes(player.character as PlayerCharacter) ?
          player.character as PlayerCharacter : undefined, ready: player.ready, connected: player.connected,
        bot: player.bot || undefined,
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
          this.resetGameplay();
          this.round.start(now);
          directory.setPhase(this.roomId, 'running');
        }
        if (this.state.phase === 'running') {
          this.advanceRound(now);
          if (this.state.phase === 'running') {
            this.bots.advance(now);
            this.movement.advance(elapsedMs, now);
            this.incidents.evaluate(now, roundDurationMs - this.state.roundRemainingMs);
            this.arrivals.advance(elapsedMs, roundDurationMs - this.state.roundRemainingMs);
          }
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
      this.onMessage('game:replay', (client, value: unknown) => {
        const result = this.lobby.replay(client.sessionId, value);
        if (result.ok) {
          this.resetGameplay();
          directory.setPhase(this.roomId, 'lobby');
        }
        respond(client, result, true);
      });
      this.onMessage('lobby:addBot', (client, value: unknown) => {
        let result = this.lobby.hostCommand(client.sessionId, value);
        if (result.ok && this.state.players.size >= capacity) result = { ok: false, reason: 'Room is full' };
        if (result.ok && !this.bots.add()) result = { ok: false, reason: 'No Pokémon left for a bot' };
        if (result.ok) this.updateSeatLimit();
        respond(client, result, true);
      });
      this.onMessage('lobby:removeBot', (client, value: unknown) => {
        let result = this.lobby.hostCommand(client.sessionId, value);
        const botId = (value as { botId?: unknown } | null)?.botId;
        if (result.ok && (typeof botId !== 'string' || !this.bots.remove(botId))) {
          result = { ok: false, reason: 'Unknown bot' };
        }
        if (result.ok) this.updateSeatLimit();
        respond(client, result, true);
      });
      this.onMessage('lobby:botCharacter', (client, value: unknown) => {
        let result = this.lobby.hostCommand(client.sessionId, value);
        const command = value as { botId?: unknown; character?: unknown } | null;
        if (result.ok) result = this.lobby.setBotCharacter(command?.botId, command?.character);
        respond(client, result, true);
      });
      this.onMessage('player:input', (client, input: unknown) => {
        this.advanceRound(performance.now());
        this.commands.input(client.sessionId, input, performance.now());
      });
      this.onMessage('medicine:interact', (client, input: unknown) => {
        const now = performance.now();
        this.advanceRound(now);
        client.send('medicine:result', this.commands.medicineInteract(client.sessionId, input, now));
      });
      this.onMessage('patient:interact', (client, input: unknown) => {
        const now = performance.now();
        this.advanceRound(now);
        client.send('patient:result', this.commands.patientInteract(client.sessionId, input, now));
      });
      this.onMessage('ability:use', (client, input: unknown) => {
        const now = performance.now();
        this.advanceRound(now);
        client.send('patient:result', this.commands.ability(client.sessionId, input, now));
      });
    }

    /** Bots occupy seats, so fewer people may join while they are present. */
    private updateSeatLimit(): void {
      this.maxClients = Math.max(1, capacity - this.bots.ids().length);
    }

    onAuth(_client: Client, options: Partial<PrivateRoomOptions> & { code?: string } = {}): boolean {
      if (!validatePlayerName(options.name)) {
        throw new ServerError(ErrorCode.AUTH_FAILED, 'Enter a name of 1–16 visible characters');
      }
      if (this.state.phase !== 'lobby') {
        throw new ServerError(ErrorCode.AUTH_FAILED, this.state.phase === 'countdown' ?
          'Countdown in progress' : 'Game in progress');
      }
      if (options.creatorKey !== this.creatorKey && normalizeRoomCode(options.code) !== this.code) {
        throw new ServerError(ErrorCode.AUTH_FAILED, 'Invalid room code');
      }
      if (this.state.players.size >= capacity) throw new ServerError(ErrorCode.AUTH_FAILED, 'Room is full');
      return true;
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
      player.bot = false;
      player.abilityPatientId = '';
      player.abilityRemainingMs = 0;
      this.state.players.set(client.sessionId, player);
      this.lobby.joined(client.sessionId);
      this.updateEmptyRoomDeadline();
      this.broadcast('lobby:players', this.roster());
    }

    onDrop(client: Client): void {
      this.advanceRound(performance.now());
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      this.commands.release(client.sessionId);
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
      this.advanceRound(performance.now());
      this.commands.release(client.sessionId);
      this.movement.remove(client.sessionId);
      this.state.players.delete(client.sessionId);
      this.reconnectUntil.delete(client.sessionId);
      this.lobby.departed(client.sessionId);
      // Bots only fill seats around people; a room without people releases them.
      if ([...this.state.players.values()].every((player) => player.bot)) {
        this.bots.removeAll();
        this.updateSeatLimit();
      }
      if (!this.state.players.size) {
        this.lobby.resetEmpty();
        this.resetGameplay();
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
