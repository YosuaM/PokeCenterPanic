import type { Room } from '@colyseus/sdk';
import type { Direction, HealingMachineSnapshot, MedicineDiscardEvent, MedicineDoseRecord, PatientInteractionRequest,
  PatientInteractionResult, PatientRecord, PlayerCharacter, PlayerPosition, PlayerPresence,
  RoomPhaseSnapshot, RoundProgressSnapshot, RoundResults } from '@pokecenter/shared';
import type { JoinedRoom } from './RoomGateway.js';

export interface LobbyGateway {
  create(name: string): Promise<JoinedRoom>;
  join(code: string, name: string): Promise<JoinedRoom>;
  reconnect(token: string, code: string): Promise<JoinedRoom>;
}

export interface LobbyView {
  setBusy(busy: boolean): void;
  showRoom(code: string, players: PlayerPresence[], localId: string): void;
  showPositions(positions: PlayerPosition[]): void;
  showPatients(patients: PatientRecord[]): void;
  showMedicines(doses: MedicineDoseRecord[], surfaces: string[], owners: string[], remainingMs: number[]): void;
  showMedicineDiscard(event: MedicineDiscardEvent): void;
  showInteractionResult(result: PatientInteractionResult): void;
  showHealingMachine(machine: HealingMachineSnapshot, second?: HealingMachineSnapshot): void;
  showDischargedCount(count: number): void;
  showLostCount(count: number): void;
  showPhase(snapshot: RoomPhaseSnapshot, localId: string): void;
  showRound(snapshot: RoundProgressSnapshot): void;
  showLobbyResult(reason: string): void;
  showMenu(message: string): void;
}

export class LobbyController {
  private room: Room | null = null;
  private busy = false;
  private reconnecting = false;
  private roomCode = '';
  private nextInputSequence = 0;
  private readonly seenDiscards = new Set<string>();
  private phase: RoomPhaseSnapshot = { phase: 'lobby', hostId: '', countdownRemainingMs: 0,
    roundId: '' };

  constructor(private readonly gateway: LobbyGateway, private readonly view: LobbyView,
    private readonly storage?: Storage) {}

  async restore(): Promise<void> {
    let saved: { token: string; code: string; sequence: number } | undefined;
    try {
      saved = JSON.parse(this.storage?.getItem('pokecenter:room') ?? 'null') as typeof saved;
    } catch { this.storage?.removeItem('pokecenter:room'); }
    if (!saved || typeof saved.token !== 'string' || typeof saved.code !== 'string' ||
      !Number.isSafeInteger(saved.sequence) || saved.sequence < 0) return;
    await this.enter(() => this.gateway.reconnect(saved.token, saved.code), saved.sequence);
  }

  async create(name: string): Promise<void> {
    await this.enter(() => this.gateway.create(name));
  }

  async join(code: string, name: string): Promise<void> {
    await this.enter(() => this.gateway.join(code, name));
  }

  async leave(): Promise<void> {
    const room = this.room;
    this.room = null;
    this.storage?.removeItem('pokecenter:room');
    if (room) await room.leave().catch(() => undefined);
    this.view.showMenu('You left the room.');
  }

  sendInput(direction: Direction | null, interactHeld = false, abilityHeld = false): void {
    if (!this.room || this.reconnecting || this.phase.phase !== 'running') return;
    this.room.send('player:input', {
      direction,
      interactHeld,
      abilityHeld,
      sequence: this.nextSequence(),
      roundId: this.phase.roundId,
    });
  }

  sendInteraction(request: PatientInteractionRequest): void {
    if (this.reconnecting || this.phase.phase !== 'running') return;
    this.room?.send(request.targetId.startsWith('medicine:') ? 'medicine:interact' : 'patient:interact', {
      ...request, sequence: this.nextSequence(), roundId: this.phase.roundId,
    });
  }

  sendAbility(request: PatientInteractionRequest): void {
    if (this.reconnecting || this.phase.phase !== 'running') return;
    this.room?.send('ability:use', { ...request, sequence: this.nextSequence(), roundId: this.phase.roundId });
  }

  addBot(): void {
    if (!this.reconnecting) this.room?.send('lobby:addBot', { sequence: this.nextSequence(), roundId: null });
  }

  removeBot(botId: string): void {
    if (!this.reconnecting) this.room?.send('lobby:removeBot', { botId, sequence: this.nextSequence(), roundId: null });
  }

  setBotCharacter(botId: string, character: PlayerCharacter): void {
    if (!this.reconnecting) this.room?.send('lobby:botCharacter', { botId, character,
      sequence: this.nextSequence(), roundId: null });
  }

  selectCharacter(character: PlayerCharacter | null): void {
    if (!this.reconnecting) this.room?.send('player:select', { character,
      sequence: this.nextSequence(), roundId: null });
  }

  setReady(ready: boolean): void {
    if (!this.reconnecting) this.room?.send('player:ready', { ready,
      sequence: this.nextSequence(), roundId: null });
  }

  startGame(): void {
    if (!this.reconnecting) this.room?.send('game:start', {
      sequence: this.nextSequence(), roundId: null });
  }

  replay(): void {
    if (!this.room || this.reconnecting || this.phase.phase !== 'results' ||
      this.phase.hostId !== this.room.sessionId) return;
    this.room.send('game:replay', { sequence: this.nextSequence(), roundId: this.phase.roundId });
  }

  private nextSequence(): number {
    this.nextInputSequence += 1;
    this.saveSession();
    return this.nextInputSequence;
  }

  private saveSession(): void {
    if (!this.storage || !this.room?.reconnectionToken) return;
    this.storage.setItem('pokecenter:room', JSON.stringify({ token: this.room.reconnectionToken,
      code: this.roomCode, sequence: this.nextInputSequence }));
  }

  private async enter(connect: () => Promise<JoinedRoom>, resumeSequence = 0): Promise<void> {
    if (this.busy || this.room) return;
    this.busy = true;
    this.view.setBusy(true);
    try {
      const { code, room } = await connect();
      this.room = room;
      this.seenDiscards.clear();
      this.roomCode = code;
      this.reconnecting = false;
      this.nextInputSequence = resumeSequence;
      room.reconnection.minUptime = 0;
      this.saveSession();
      this.phase = { phase: 'lobby', hostId: '', countdownRemainingMs: 0, roundId: '' };
      this.view.showRoom(code, [], room.sessionId);
      const updateState = (state: unknown) => {
        if (this.room !== room || !state || typeof state !== 'object' || !('players' in state)) return;
        const snapshot = state as {
          players: Map<string, { x: number; y: number; facing: Direction;
            carriedPatientId: string; carriedMedicineId?: string; connected?: boolean; abilityRemainingMs?: number }>;
          patients?: Map<string, PatientRecord>;
          medicineDoses?: Map<string, MedicineDoseRecord>;
          medicineSurfaces?: string[];
          medicinePreparationOwners?: string[];
          medicinePreparationRemainingMs?: number[];
          healingMachine?: HealingMachineSnapshot;
          secondHealingMachine?: HealingMachineSnapshot;
          dischargedCount?: number;
          lostCount?: number;
          phase?: RoomPhaseSnapshot['phase'];
          hostId?: string;
          countdownRemainingMs?: number;
          roundId?: string;
          roundRemainingMs?: number;
          score?: number;
          streak?: number;
          results?: RoundResults;
        };
        const players = snapshot.players;
        this.view.showPositions([...players].filter(([, player]) => player.connected !== false)
          .map(([id, player]) => ({
          id, x: player.x, y: player.y, facing: player.facing, carriedPatientId: player.carriedPatientId,
          carriedMedicineId: player.carriedMedicineId ?? '',
          ...(player.abilityRemainingMs ? { abilityRemainingMs: player.abilityRemainingMs } : {}),
          })));
        this.view.showPatients(snapshot.patients ? [...snapshot.patients.values()] : []);
        this.view.showMedicines(snapshot.medicineDoses ? [...snapshot.medicineDoses.values()] : [],
          snapshot.medicineSurfaces ? [...snapshot.medicineSurfaces] : [],
          snapshot.medicinePreparationOwners ? [...snapshot.medicinePreparationOwners] : [],
          snapshot.medicinePreparationRemainingMs ? [...snapshot.medicinePreparationRemainingMs] : []);
        if (snapshot.healingMachine) {
          if (snapshot.secondHealingMachine) this.view.showHealingMachine(snapshot.healingMachine, snapshot.secondHealingMachine);
          else this.view.showHealingMachine(snapshot.healingMachine);
        }
        if (typeof snapshot.dischargedCount === 'number') this.view.showDischargedCount(snapshot.dischargedCount);
        if (typeof snapshot.lostCount === 'number') this.view.showLostCount(snapshot.lostCount);
        if (snapshot.phase && typeof snapshot.hostId === 'string' &&
          typeof snapshot.countdownRemainingMs === 'number' && typeof snapshot.roundId === 'string') {
          if (this.phase.roundId !== snapshot.roundId) this.seenDiscards.clear();
          this.phase = { phase: snapshot.phase, hostId: snapshot.hostId,
            countdownRemainingMs: snapshot.countdownRemainingMs, roundId: snapshot.roundId };
          this.view.showPhase(this.phase, room.sessionId);
        }
        if (typeof snapshot.roundRemainingMs === 'number' && typeof snapshot.score === 'number') {
          this.view.showRound({ remainingMs: snapshot.roundRemainingMs, score: snapshot.score,
            streak: snapshot.streak ?? 0,
            results: snapshot.phase === 'results' && snapshot.results ? {
              score: snapshot.results.score, admitted: snapshot.results.admitted,
              discharged: snapshot.results.discharged, lost: snapshot.results.lost,
              unfinished: snapshot.results.unfinished, stars: snapshot.results.stars,
              bestStreak: snapshot.results.bestStreak ?? 0 } : null });
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
      room.onMessage('medicine:discarded', (event: MedicineDiscardEvent) => {
        if (this.room !== room || this.reconnecting || this.phase.phase !== 'running' ||
          event.roundId !== this.phase.roundId || this.seenDiscards.has(event.doseId)) return;
        this.seenDiscards.add(event.doseId);
        this.view.showMedicineDiscard(event);
      });
      room.onMessage('medicine:result', (result: PatientInteractionResult) => {
        if (this.room === room) this.view.showInteractionResult(result);
      });
      room.onMessage('lobby:result', (result: { ok: boolean; reason: string }) => {
        if (this.room === room && !result.ok) this.view.showLobbyResult(result.reason);
      });
      room.onMessage('room:resume', (result: { lastSequence: number }) => {
        if (this.room !== room || !Number.isSafeInteger(result.lastSequence)) return;
        this.nextInputSequence = Math.max(this.nextInputSequence, result.lastSequence);
        this.saveSession();
      });
      room.onDrop(() => {
        if (this.room !== room) return;
        this.reconnecting = true;
        this.view.showLobbyResult('Reconnecting to the room…');
      });
      room.onReconnect(() => {
        if (this.room !== room) return;
        this.reconnecting = false;
        this.saveSession();
        this.view.showLobbyResult('');
        room.send('lobby:sync');
      });
      room.onLeave(() => {
        if (this.room !== room) return;
        this.room = null;
        this.storage?.removeItem('pokecenter:room');
        this.view.showMenu(this.reconnecting ? 'Reconnection failed. Reservation expired or room closed.' :
          'Connection to the room was lost.');
      });
      room.send('lobby:sync');
    } catch (error) {
      if (error instanceof Error && /expired|closed/i.test(error.message)) {
        this.storage?.removeItem('pokecenter:room');
      }
      this.view.showMenu(error instanceof Error ? error.message : 'Could not enter the room');
    } finally {
      this.busy = false;
      this.view.setBusy(false);
    }
  }
}
