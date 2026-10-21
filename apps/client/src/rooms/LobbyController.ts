import type { Room } from '@colyseus/sdk';
import type { Direction, HealingMachineSnapshot, PatientInteractionRequest, PatientInteractionResult,
  PatientRecord, PlayerCharacter, PlayerPosition, PlayerPresence, RoomPhaseSnapshot } from '@pokecenter/shared';
import type { JoinedRoom } from './RoomGateway.js';

export interface LobbyGateway {
  create(name: string): Promise<JoinedRoom>;
  join(code: string, name: string): Promise<JoinedRoom>;
}

export interface LobbyView {
  setBusy(busy: boolean): void;
  showRoom(code: string, players: PlayerPresence[], localId: string): void;
  showPositions(positions: PlayerPosition[]): void;
  showPatients(patients: PatientRecord[]): void;
  showInteractionResult(result: PatientInteractionResult): void;
  showHealingMachine(machine: HealingMachineSnapshot): void;
  showDischargedCount(count: number): void;
  showPhase(snapshot: RoomPhaseSnapshot, localId: string): void;
  showLobbyResult(reason: string): void;
  showMenu(message: string): void;
}

export class LobbyController {
  private room: Room | null = null;
  private busy = false;
  private nextInputSequence = 0;
  private phase: RoomPhaseSnapshot = { phase: 'lobby', hostId: '', countdownRemainingMs: 0,
    roundId: '' };

  constructor(private readonly gateway: LobbyGateway, private readonly view: LobbyView) {}

  async create(name: string): Promise<void> {
    await this.enter(() => this.gateway.create(name));
  }

  async join(code: string, name: string): Promise<void> {
    await this.enter(() => this.gateway.join(code, name));
  }

  async leave(): Promise<void> {
    const room = this.room;
    this.room = null;
    if (room) await room.leave().catch(() => undefined);
    this.view.showMenu('You left the room.');
  }

  sendInput(direction: Direction | null): void {
    if (!this.room || this.phase.phase !== 'running') return;
    this.room.send('player:input', {
      direction,
      sequence: ++this.nextInputSequence,
      roundId: this.phase.roundId,
    });
  }

  sendInteraction(request: PatientInteractionRequest): void {
    if (this.phase.phase === 'running') this.room?.send('patient:interact', request);
  }

  selectCharacter(character: PlayerCharacter): void {
    this.room?.send('player:select', { character, sequence: ++this.nextInputSequence, roundId: null });
  }

  setReady(ready: boolean): void {
    this.room?.send('player:ready', { ready, sequence: ++this.nextInputSequence, roundId: null });
  }

  startGame(): void {
    this.room?.send('game:start', { sequence: ++this.nextInputSequence, roundId: null });
  }

  private async enter(connect: () => Promise<JoinedRoom>): Promise<void> {
    if (this.busy || this.room) return;
    this.busy = true;
    this.view.setBusy(true);
    try {
      const { code, room } = await connect();
      this.room = room;
      this.nextInputSequence = 0;
      this.phase = { phase: 'lobby', hostId: '', countdownRemainingMs: 0, roundId: '' };
      this.view.showRoom(code, [], room.sessionId);
      const updateState = (state: unknown) => {
        if (this.room !== room || !state || typeof state !== 'object' || !('players' in state)) return;
        const snapshot = state as {
          players: Map<string, { x: number; y: number; facing: Direction; carriedPatientId: string }>;
          patients?: Map<string, PatientRecord>;
          healingMachine?: HealingMachineSnapshot;
          dischargedCount?: number;
          phase?: RoomPhaseSnapshot['phase'];
          hostId?: string;
          countdownRemainingMs?: number;
          roundId?: string;
        };
        const players = snapshot.players;
        this.view.showPositions([...players].map(([id, player]) => ({
          id, x: player.x, y: player.y, facing: player.facing, carriedPatientId: player.carriedPatientId,
        })));
        this.view.showPatients(snapshot.patients ? [...snapshot.patients.values()] : []);
        if (snapshot.healingMachine) this.view.showHealingMachine(snapshot.healingMachine);
        if (typeof snapshot.dischargedCount === 'number') this.view.showDischargedCount(snapshot.dischargedCount);
        if (snapshot.phase && typeof snapshot.hostId === 'string' &&
          typeof snapshot.countdownRemainingMs === 'number' && typeof snapshot.roundId === 'string') {
          this.phase = { phase: snapshot.phase, hostId: snapshot.hostId,
            countdownRemainingMs: snapshot.countdownRemainingMs, roundId: snapshot.roundId };
          this.view.showPhase(this.phase, room.sessionId);
        }
      };
      room.onStateChange(updateState);
      updateState(room.state);
      room.onMessage('lobby:players', (players: PlayerPresence[]) => {
        if (this.room === room) this.view.showRoom(code, players, room.sessionId);
      });
      room.onMessage('patient:result', (result: PatientInteractionResult) => {
        if (this.room === room) this.view.showInteractionResult(result);
      });
      room.onMessage('lobby:result', (result: { ok: boolean; reason: string }) => {
        if (this.room === room && !result.ok) this.view.showLobbyResult(result.reason);
      });
      room.onLeave(() => {
        if (this.room !== room) return;
        this.room = null;
        this.view.showMenu('Connection to the room was lost.');
      });
      room.send('lobby:sync');
    } catch (error) {
      this.view.showMenu(error instanceof Error ? error.message : 'Could not enter the room');
    } finally {
      this.busy = false;
      this.view.setBusy(false);
    }
  }
}
