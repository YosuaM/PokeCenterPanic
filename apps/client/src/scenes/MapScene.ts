import { LOGICAL_WIDTH, LOGICAL_HEIGHT, MAX_RENDER_SCALE, observeRenderSize } from '../renderResolution.js';
import { MAP_2D_SCALE, mapViewportPoint } from './mapViewport.js';
import Phaser from 'phaser';
import { ContextualHints, hintActionFor, type HintAction } from './contextualHints.js';
import { ABILITY_NAME } from '../ui/characterRoles.js';
import { GameHud } from '../ui/hud/GameHud.js';
import { IDLE_ACTION, type HudAction, type HudSink, type HudState } from '../ui/hud/hudState.js';
import { ABILITY_DURATION_MS, DISCHARGE_INTERACTION_POINT, DISCHARGE_POSITION,
  HEALING_MACHINE_POSITION, MAP_OBSTACLES, MEDICINE_DISPOSAL_POINT,
  HEALING_MACHINE_POSITIONS, HEALING_INTERACTION_POINTS,
  MEDICINE_PREPARATION_POINTS, MEDICINE_SURFACE_POINTS, characterProfile, type CharacterAbility,
  RECOVERY_INTERACTION_POINT, RECOVERY_POSITION,
  RECEPTION_INTERACTION_POINTS, RECEPTION_SLOT_POSITIONS, SPAWN_POINTS, TILE_SIZE,
  TREATMENT, WALK_BOUNDS, WAITING_BENCHES, WAITING_INTERACTION_POINTS, WAITING_SLOT_POSITIONS, isWalkable, patientPresentation, patientTravelPose,
  patientPatienceRatio, PATIENT_FAINT_DURATION_MS,
  selectInteractionTarget, stationInteractionBounds, type Direction, type HealingMachineSnapshot, type MedicineDoseRecord, type MedicineDiscardEvent,
  type InteractionTarget, type MapObstacle, type PatientInteractionRequest,
  type PatientInteractionResult, type PatientRecord, type PlayerPosition, type PlayerPresence, type Point } from '@pokecenter/shared';
import { MovementInput } from './movement.js';
import { PatientReadyAlerts } from './patientIndicatorAlerts.js';
import { SoftPatientAudio, PatientSoundTransitions } from './patientAlertAudio.js';
import { bindPatientAudioControls } from './patientAudioControls.js';
import { patientDistress } from './patientDistress.js';
import { visualFixture, type VisualFixture } from './visualFixtures.js';
import { Center3DView, characterElevation, type Center3DCharacter } from './center3dView.js';
import { animationRow, parseSpriteManifest, patientRenderPosition, playerSpriteSpecies,
  spriteMotion, type SpriteAnimation, type SpriteManifest } from '../sprites/pmd.js';

const PATIENT_SLOT_TARGET = /^(?:(?:reception|waiting):\d+|recovery)$/;
const ACTIONABLE_LABEL = /^(?:Pick up |Place|Discharge patient|Apply |Discard medicine|Hold E:|Preparing )/;
const PLAYER_COLORS = [0x4cc9c0, 0xf29c75, 0xb2a0f7, 0xf5ce69];
// Label heights above the floor, in 3D world units, for the HUD's world anchors.
const PLAYER_LABEL_HEIGHT = 2.05;
const PATIENT_LABEL_HEIGHT = 1.45;
const MACHINE_LABEL_HEIGHT = 1.1;
const PREPARATION_LABEL_HEIGHT = 1.9;
const DISCHARGE_LABEL_HEIGHT = 2.2;

interface Avatar {
  /** Phaser body for the 2D fallback; the 3D view draws characters itself. */
  container?: Phaser.GameObjects.Container;
  position: Point;
  target: Point;
  sprite?: Phaser.GameObjects.Sprite;
  species: string;
}

interface PatientMarker {
  container: Phaser.GameObjects.Container;
  signature: string;
  sprite?: Phaser.GameObjects.Sprite;
}

export class MapScene extends Phaser.Scene {
  private readonly movement = new MovementInput();
  private readonly avatars = new Map<string, Avatar>();
  private readonly patientMarkers = new Map<string, PatientMarker>();
  private readonly medicineMarkers = new Map<string, Phaser.GameObjects.Container>();
  private readonly authoritativePositions = new Map<string, PlayerPosition>();
  private players: PlayerPresence[] = [];
  private patients: PatientRecord[] = [];
  private frameTime = 0;
  private patientSnapshotTime = 0;
  private readonly patientTravelTimes = new Map<string, number>();
  private medicineDoses: MedicineDoseRecord[] = [];
  private medicineSurfaces: string[] = [];
  private medicineOwners: string[] = [];
  private medicineRemainingMs: number[] = [];
  private localId = '';
  private inputSender: ((direction: Direction | null, interactHeld: boolean, abilityHeld: boolean) => void) | null = null;
  private interactionSender: ((request: PatientInteractionRequest) => void) | null = null;
  private abilitySender: ((request: PatientInteractionRequest) => void) | null = null;
  private readonly hints = new ContextualHints();
  private hintAction: HintAction | null = null;
  private hudAction: HudAction = IDLE_ACTION;
  private tip = '';
  private notice = '';
  private focusedPatientId = '';
  private hud: HudSink | null = null;
  private hudOverride: HudSink | null = null;
  private readonly readyAlerts = new PatientReadyAlerts();
  private readonly soundTransitions = new PatientSoundTransitions();
  private patientAudio: SoftPatientAudio | null = null;
  private releaseAudioControls = () => {};
  private reducedMotion = false;
  private targetHighlight!: Phaser.GameObjects.Rectangle;
  private fixtureDiscardAtTime: VisualFixture['discardAtTime'];
  private lastFixtureDiscard = '';
  private fixturePositionsAtTime: VisualFixture['positionsAtTime'];
  private fixturePatientsAtTime: VisualFixture['patientsAtTime'];
  private dischargedCount = 0;
  private lostCount = 0;
  private roundRemainingMs = 360_000;
  private roundScore = 0;
  private roundStreak = 0;
  private healingMachine: HealingMachineSnapshot = { patientId: '', status: 'empty', remainingMs: 0 };
  private secondHealingMachine: HealingMachineSnapshot = { patientId: '', status: 'empty', remainingMs: 0 };
  private selectedTarget: InteractionTarget | null = null;
  private interactionFeedback = '';
  private lastSentAt = -Infinity;
  private lastSentDirection: Direction | null = null;
  private lastSentHeld = false;
  private interactHeld = false;
  private abilityHeld = false;
  private lastSentAbility = false;
  private spriteManifest: SpriteManifest | null = null;
  private spritesReady = false;
  private mapArtLoaded = false;
  private gameplayActive = true;
  private center3D: Center3DView | null = null;
  private stopObservingSize = () => {};

  constructor() {
    super('map');
  }

  preload(): void {
    this.load.image('center-floor', '/assets/original/center-floor.png');
    this.load.image('center-fixtures', '/assets/original/center-fixtures.png');
    this.load.image('stretcher', '/assets/original/stretcher.png');
    this.load.image('medicine-bottle', '/assets/original/medicine-bottle.png');
    this.load.json('pmd-manifest', '/assets/external/pmd/manifest.json');
  }

  create(): void {
    if (typeof document.querySelector === 'function') {
      const mount = document.querySelector<HTMLElement>('#game');
      if (mount) this.stopObservingSize = observeRenderSize(mount, ({ width, height }) => {
        this.scale.setGameSize(width, height);
        this.cameras.main.setSize(width, height).setZoom(width / LOGICAL_WIDTH)
          .centerOn(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2);
      });
    }
    if (typeof location !== 'undefined' && typeof document.querySelector === 'function' &&
      new URLSearchParams(location.search).get('render') !== '2d') {
      const mount = document.querySelector<HTMLElement>('#game');
      if (mount) {
        try {
          this.center3D = new Center3DView(mount);
        } catch (error) {
          console.warn('3D view unavailable; using 2D map:', error);
        }
      }
    }
    this.drawMap();
    this.readyAlerts.clear();
    this.soundTransitions.clear();
    this.patientAudio = new SoftPatientAudio(() => {
      const manager = this.sound;
      return manager && 'context' in manager ? manager.context : null;
    });
    if (typeof document.querySelector === 'function') {
      const button = document.querySelector<HTMLButtonElement>('#patient-audio-toggle');
      const volume = document.querySelector<HTMLInputElement>('#patient-audio-volume');
      if (button && volume) {
        let storage: Storage | null = null;
        try { storage = window.localStorage; } catch { /* Audio settings can be session-only. */ }
        this.releaseAudioControls = bindPatientAudioControls(this.patientAudio, button, volume,
          storage, window, document);
      }
    }
    const motion = typeof window.matchMedia === 'function' ?
      window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const updateMotion = () => { this.reducedMotion = motion?.matches ?? false; };
    updateMotion();
    motion?.addEventListener('change', updateMotion);
    this.targetHighlight = this.add.rectangle(0, 0, 42, 28, 0xffff00, 0)
      .setStrokeStyle(2, 0xffff00).setVisible(false).setDepth(1000);
    this.hud = this.hudOverride ?? this.createDomHud();
    this.renderPlayers();
    this.renderPatients();
    this.loadPmdSprites();
    this.fixturePositionsAtTime = undefined;
    this.fixturePatientsAtTime = undefined;
    this.fixtureDiscardAtTime = undefined;
    this.lastFixtureDiscard = '';
    if (import.meta.env.DEV && typeof location !== 'undefined') {
      const fixture = visualFixture(new URLSearchParams(location.search).get('artFixture'));
      if (fixture) {
        this.fixturePositionsAtTime = fixture.positionsAtTime;
        this.fixturePatientsAtTime = fixture.patientsAtTime;
        this.fixtureDiscardAtTime = fixture.discardAtTime;
        this.setPlayers(fixture.players, fixture.players[0]!.id);
        this.setAuthoritativePositions(fixture.positions);
        this.setPatients(fixture.patients);
        this.setHealingMachine(fixture.machine);
        const doses = fixture.medicineDoses ?? [];
        const surfaces = MEDICINE_SURFACE_POINTS.map((_, slot) =>
          doses.find((dose) => dose.location === 'surface' && dose.slotIndex === slot)?.id ?? '');
        this.setMedicines(doses, surfaces, fixture.medicineOwners, fixture.medicineRemainingMs);
        this.renderPlayers();
        this.renderPatients();
        this.renderMedicines();
        this.refreshInteraction();
        if (fixture.result) this.setInteractionResult(fixture.result);
      }
    }
    this.input.keyboard?.on('keydown', this.onKeyDown, this);
    this.input.keyboard?.on('keyup', this.onKeyUp, this);
    window.addEventListener('blur', this.clearMovement);
    document.addEventListener('visibilitychange', this.clearMovement);
    document.addEventListener('focusin', this.onFocusIn);
    this.publishHud();
    this.events.once('shutdown', () => {
      motion?.removeEventListener('change', updateMotion);
      this.stopObservingSize();
      this.readyAlerts.clear();
      this.hud?.destroy();
      this.hud = null;
      this.soundTransitions.clear();
      this.releaseAudioControls();
      this.patientAudio?.dispose();
      this.center3D?.destroy();
      this.center3D = null;
      this.input.keyboard?.off('keydown', this.onKeyDown, this);
      this.input.keyboard?.off('keyup', this.onKeyUp, this);
      window.removeEventListener('blur', this.clearMovement);
      document.removeEventListener('visibilitychange', this.clearMovement);
      document.removeEventListener('focusin', this.onFocusIn);
    });
  }

  setPlayers(players: PlayerPresence[], localId: string): void {
    if (this.localId !== localId) {
      this.movement.clear();
      this.authoritativePositions.clear();
      this.lastSentDirection = null;
      this.lastSentHeld = false;
      this.interactHeld = false;
      this.abilityHeld = false;
      this.lastSentAbility = false;
      this.lastSentAt = -Infinity;
    }
    this.players = players;
    this.localId = localId;
    if (this.sys.isActive()) {
      this.renderPlayers();
      this.renderPatients();
      this.refreshInteraction();
    }
  }

  clearPlayers(): void {
    this.soundTransitions.clear();
    this.patientAudio?.stop();
    this.center3D?.clearMedicineDiscards();
    this.setPlayers([], '');
    this.setPatients([]);
    this.setMedicines([], [], [], []);
    this.setHealingMachine({ patientId: '', status: 'empty', remainingMs: 0 });
    this.setDischargedCount(0);
    this.setLostCount(0);
    this.setRoundProgress(360_000, 0);
    this.inputSender = null;
    this.interactionSender = null;
    this.abilitySender = null;
    this.interactionFeedback = '';
    this.refreshInteraction();
  }

  setPatients(patients: PatientRecord[]): void {
    this.patients = patients;
    if (this.gameplayActive) {
      this.readyAlerts.sync(patients, this.frameTime);
      const cues = this.soundTransitions.sync(patients);
      if (cues.length && !document.hidden) this.patientAudio?.play(cues);
    }
    this.patientSnapshotTime = this.frameTime;
    this.patientTravelTimes.clear();
    for (const patient of patients) this.patientTravelTimes.set(patient.id, patient.travelElapsedMs ?? 0);
    if (this.sys.isActive()) {
      this.renderPatients();
      this.refreshInteraction();
    }
  }

  setMedicines(doses: MedicineDoseRecord[], surfaces: string[], owners: string[], remainingMs: number[]): void {
    this.medicineDoses = doses;
    this.medicineSurfaces = surfaces;
    this.medicineOwners = owners;
    this.medicineRemainingMs = remainingMs;
    if (this.sys.isActive()) {
      this.renderMedicines();
      this.refreshInteraction();
    }
  }

  setAbilitySender(sender: (request: PatientInteractionRequest) => void): void {
    this.abilitySender = sender;
  }

  setInputSender(sender: (direction: Direction | null, interactHeld: boolean, abilityHeld: boolean) => void): void {
    this.inputSender = sender;
  }

  setGameplayActive(active: boolean): void {
    const starting = active && !this.gameplayActive;
    this.gameplayActive = active;
    if (starting) {
      this.readyAlerts.sync(this.patients, this.frameTime);
      this.soundTransitions.sync(this.patients);
    }
    if (!active) {
      this.clearMovement();
      this.center3D?.clearMedicineDiscards();
      this.readyAlerts.clear();
      this.soundTransitions.clear();
      this.patientAudio?.stop();
      this.notice = '';
    }
    if (this.sys.isActive()) this.publishHud();
  }

  /** Replaces the DOM HUD, e.g. with a recording sink in tests; call before the scene is created. */
  useHud(sink: HudSink): void {
    this.hudOverride = sink;
  }

  setInteractionSender(sender: (request: PatientInteractionRequest) => void): void {
    this.interactionSender = sender;
  }

  showMedicineDiscard(event: MedicineDiscardEvent): void {
    this.center3D?.showMedicineDiscard(event);
  }

  setInteractionResult(result: PatientInteractionResult): void {
    this.interactionFeedback = result.ok ? '' : result.reason;
    this.refreshInteraction();
  }

  setHealingMachine(machine: HealingMachineSnapshot, second: HealingMachineSnapshot = {
    patientId: '', status: 'empty', remainingMs: 0,
  }): void {
    if (this.gameplayActive && !document.hidden &&
      ((machine.status === 'broken' && this.healingMachine.status !== 'broken') ||
        (second.status === 'broken' && this.secondHealingMachine.status !== 'broken'))) {
      this.patientAudio?.play(['outage']);
    }
    const copy = (value: HealingMachineSnapshot): HealingMachineSnapshot => ({
      patientId: value.patientId, status: value.status, remainingMs: value.remainingMs,
      durationMs: value.durationMs, repairOwnerId: value.repairOwnerId, repairRemainingMs: value.repairRemainingMs,
    });
    this.healingMachine = copy(machine);
    this.secondHealingMachine = copy(second);
    if (this.sys.isActive()) this.refreshInteraction();
  }

  setDischargedCount(count: number): void {
    this.dischargedCount = count;
    if (this.sys.isActive()) this.publishHud();
  }

  setLostCount(count: number): void {
    this.lostCount = count;
    if (this.sys.isActive()) this.publishHud();
  }

  setRoundProgress(remainingMs: number, score: number, streak = 0): void {
    this.roundRemainingMs = remainingMs;
    this.roundScore = score;
    this.roundStreak = streak;
    if (this.sys.isActive()) this.publishHud();
  }

  /** The HUD state last published, for debugging and tests. */
  hudState(): HudState {
    return {
      active: this.gameplayActive,
      localId: this.localId,
      players: this.players,
      positions: [...this.authoritativePositions.values()],
      patients: this.patients,
      machines: [this.healingMachine, this.secondHealingMachine],
      doses: this.medicineDoses,
      medicineOwners: this.medicineOwners,
      medicineRemainingMs: this.medicineRemainingMs,
      remainingMs: this.roundRemainingMs,
      score: this.roundScore,
      streak: this.roundStreak,
      discharged: this.dischargedCount,
      lost: this.lostCount,
      focusedPatientId: this.focusedPatientId,
      action: this.hudAction,
      tip: this.tip,
      notice: this.notice,
      manifest: this.spritesReady ? this.spriteManifest : null,
    };
  }

  private publishHud(): void {
    this.hud?.render(this.hudState(), this.frameTime);
  }

  private createDomHud(): HudSink | null {
    if (typeof document.querySelector !== 'function' || typeof document.createElement !== 'function') return null;
    const mount = document.querySelector<HTMLElement>('#game');
    return mount ? new GameHud(mount, document) : null;
  }

  setAuthoritativePositions(positions: PlayerPosition[]): void {
    for (const position of positions) {
      const { id, x, y } = position;
      this.authoritativePositions.set(id, position);
      const avatar = this.avatars.get(id);
      if (avatar) avatar.target = { x, y };
    }
    if (this.sys.isActive()) this.refreshInteraction();
  }

  update(time: number, delta: number): void {
    this.frameTime = time;
    if (import.meta.env.DEV && this.fixturePatientsAtTime) {
      const patients = this.fixturePatientsAtTime(time);
      if (patients !== this.patients) this.setPatients(patients);
    }
    this.updateReadyNotice(time);
    if (import.meta.env.DEV && this.fixtureDiscardAtTime) {
      const event = this.fixtureDiscardAtTime(time);
      if (event.doseId !== this.lastFixtureDiscard) {
        this.lastFixtureDiscard = event.doseId;
        this.showMedicineDiscard(event);
      }
    }
    if (import.meta.env.DEV && this.fixturePositionsAtTime) {
      this.setAuthoritativePositions(this.fixturePositionsAtTime(time));
    }
    const direction = this.movement.direction;
    if (this.gameplayActive && this.avatars.has(this.localId) && this.inputSender &&
      time - this.lastSentAt >= 50 &&
      (direction !== this.lastSentDirection || this.interactHeld !== this.lastSentHeld ||
        this.abilityHeld !== this.lastSentAbility || direction !== null || this.interactHeld || this.abilityHeld)) {
      this.inputSender(direction, this.interactHeld, this.abilityHeld);
      this.lastSentDirection = direction;
      this.lastSentHeld = this.interactHeld;
      this.lastSentAbility = this.abilityHeld;
      this.lastSentAt = time;
    }
    const blend = Math.min(1, Math.max(0, delta) / 70);
    const playerAnchors = new Map<string, Point>();
    const entities: Center3DCharacter[] = [];
    for (const [id, avatar] of this.avatars) {
      const next = {
        x: avatar.position.x + (avatar.target.x - avatar.position.x) * blend,
        y: avatar.position.y + (avatar.target.y - avatar.position.y) * blend,
      };
      avatar.position = isWalkable(next) ? next : { ...avatar.target };
      const carrying = Boolean(this.authoritativePositions.get(id)?.carriedPatientId);
      playerAnchors.set(id, this.anchorPoint(avatar.position, PLAYER_LABEL_HEIGHT, carrying ? -77 : -31));
      if (avatar.container) {
        const screen = mapViewportPoint(avatar.position);
        avatar.container.setPosition(screen.x, screen.y);
        avatar.container.setDepth(avatar.position.y);
      }
      const motion = spriteMotion(this.authoritativePositions.get(id), avatar.position, avatar.target);
      if (avatar.sprite) this.playSprite(avatar.sprite, avatar.species, motion.facing, motion.moving);
      entities.push({ id: `player:${id}`, species: avatar.species, point: avatar.position,
        elevation: 0.03, facing: motion.facing, moving: motion.moving, isPlayer: true, carried: false });
    }
    const patientAnchors = new Map<string, Point>();
    for (const patient of this.patients) {
      const travel = this.travelPose(patient, time);
      const carried = patient.location === 'carrier';
      const point = travel?.point ?? patientRenderPosition(patient, {
        reception: RECEPTION_SLOT_POSITIONS, waiting: WAITING_SLOT_POSITIONS,
        recovery: RECOVERY_POSITION, healingMachine: HEALING_MACHINE_POSITION,
        healingMachines: HEALING_MACHINE_POSITIONS,
      }, this.avatars.get(patient.carrierId)?.position);
      if (!point) continue;
      const facing = travel?.facing ?? (carried ?
        this.authoritativePositions.get(patient.carrierId)?.facing ?? 'down' : 'down');
      if (this.center3D) {
        const elevation = travel?.elevation ?? characterElevation(patient.location);
        entities.push({ id: `patient:${patient.id}`, species: patient.species, point,
          elevation, facing, moving: travel?.moving ?? false, isPlayer: false,
          carried, patienceRatio: patientPatienceRatio(patient),
          faintProgress: this.faintProgress(patient, time) });
        patientAnchors.set(patient.id, this.center3D.project(point, elevation + PATIENT_LABEL_HEIGHT));
        continue;
      }
      const screen = mapViewportPoint(point);
      const marker = this.patientMarkers.get(patient.id);
      if (marker && (travel || carried)) {
        marker.container.setPosition(screen.x, screen.y - (carried ? 28 : 0));
        marker.container.setDepth(point.y + (carried ? 1 : 0));
        if (marker.sprite) this.playSprite(marker.sprite, patient.species, facing, travel?.moving ?? false);
      }
      const faint = this.faintProgress(patient, time);
      if (marker && faint !== undefined) {
        const distress = patientDistress(0, time, faint);
        marker.container.setAlpha(distress.opacity).setRotation(distress.roll);
      }
      patientAnchors.set(patient.id, { x: screen.x, y: screen.y - (carried ? 52 : 24) });
    }
    for (const dose of this.medicineDoses) {
      if (dose.location !== 'carrier') continue;
      const avatar = this.avatars.get(dose.carrierId);
      const marker = this.medicineMarkers.get(dose.id);
      if (avatar && marker) {
        const screen = mapViewportPoint(avatar.position);
        marker.setPosition(screen.x, screen.y - 30);
        marker.setDepth(avatar.position.y + 1);
      }
    }
    if (this.center3D) {
      this.center3D.syncCharacters(entities, time);
      this.center3D.syncMedicines(this.medicineDoses,
        new Map([...this.avatars].map(([id, avatar]) => [id, avatar.position])), time);
      this.center3D.render(time, [this.healingMachine.status, this.secondHealingMachine.status], this.medicineOwners, this.patients);
    }
    this.hud?.place({
      players: playerAnchors,
      patients: patientAnchors,
      machines: HEALING_MACHINE_POSITIONS.map((point) => this.anchorPoint(point, MACHINE_LABEL_HEIGHT, -34)),
      preparation: MEDICINE_PREPARATION_POINTS.map((point) => this.anchorPoint(point, PREPARATION_LABEL_HEIGHT, -12)),
      discharge: this.anchorPoint(DISCHARGE_POSITION, DISCHARGE_LABEL_HEIGHT, -14),
    }, time);
  }

  /** Screen point above a world position: projected in 3D, or offset upwards on the 2D map. */
  private anchorPoint(point: Point, height: number, offset2D: number): Point {
    if (this.center3D) return this.center3D.project(point, height);
    const screen = mapViewportPoint(point);
    return { x: screen.x, y: screen.y + offset2D };
  }

  private updateReadyNotice(time: number): void {
    const notice = this.gameplayActive ? this.readyAlerts.at(time, this.reducedMotion)?.text ?? '' : '';
    if (notice === this.notice) return;
    this.notice = notice;
    this.publishHud();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.gameplayActive || !this.avatars.has(this.localId) || this.isTyping()) return;
    if (event.code === 'KeyE') {
      event.preventDefault();
      if (event.repeat) return;
      this.interactHeld = true;
      if (this.selectedTarget) {
        this.hints.markUsed(this.hintAction);
        this.interactionSender?.({
          targetId: this.selectedTarget.id,
          expectedOccupantId: this.selectedTarget.expectedOccupantId,
        });
      } else {
        this.interactionFeedback = 'No target in range';
        this.refreshInteraction();
      }
      this.inputSender?.(this.movement.direction, true, this.abilityHeld);
      this.lastSentDirection = this.movement.direction;
      this.lastSentHeld = true;
      return;
    }
    if (event.code === 'KeyQ') {
      event.preventDefault();
      if (event.repeat) return;
      this.abilityHeld = true;
      const ability = this.localAbility();
      if (!ability) this.interactionFeedback = 'This Pokémon has no special ability';
      else if (this.selectedTarget && PATIENT_SLOT_TARGET.test(this.selectedTarget.id)) {
        this.abilitySender?.({ targetId: this.selectedTarget.id, expectedOccupantId: this.selectedTarget.expectedOccupantId });
      } else this.interactionFeedback = `${ABILITY_NAME[ability]} needs a seated patient`;
      if (this.interactionFeedback) this.refreshInteraction();
      this.inputSender?.(this.movement.direction, this.interactHeld, true);
      this.lastSentDirection = this.movement.direction;
      this.lastSentAbility = true;
      return;
    }
    if (this.movement.press(event.code)) event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'KeyE' && this.interactHeld) {
      this.interactHeld = false;
      this.inputSender?.(this.movement.direction, false, this.abilityHeld);
      this.lastSentHeld = false;
    }
    if (event.code === 'KeyQ' && this.abilityHeld) {
      this.abilityHeld = false;
      this.inputSender?.(this.movement.direction, this.interactHeld, false);
      this.lastSentAbility = false;
    }
    this.movement.release(event.code);
  };

  private readonly clearMovement = (): void => {
    this.movement.clear();
    this.interactHeld = false;
    this.abilityHeld = false;
    if (this.lastSentDirection !== null || this.lastSentHeld || this.lastSentAbility) {
      this.inputSender?.(null, false, false);
      this.lastSentDirection = null;
      this.lastSentHeld = false;
      this.lastSentAbility = false;
    }
  };

  private readonly onFocusIn = (): void => {
    if (this.isTyping()) this.clearMovement();
  };

  private characterOf(playerId: string | undefined): string | undefined {
    return this.players.find((player) => player.id === playerId)?.character;
  }

  private localAbility(): CharacterAbility | null {
    return characterProfile(this.characterOf(this.localId)).ability;
  }

  private isTyping(): boolean {
    const focused = document.activeElement;
    return focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement ||
      Boolean(focused?.closest?.('#patient-audio'));
  }

  private renderPlayers(): void {
    for (const [id, avatar] of this.avatars) {
      if (!this.players.some((player) => player.id === id)) {
        avatar.container?.destroy();
        this.avatars.delete(id);
        this.authoritativePositions.delete(id);
      }
    }
    this.players.forEach((player) => {
      const existing = this.avatars.get(player.id);
      if (existing?.species === playerSpriteSpecies(player)) return;
      if (existing) {
        existing.container?.destroy();
        this.avatars.delete(player.id);
      }
      const slot = player.slot;
      const spawn = SPAWN_POINTS[slot];
      if (!spawn) return;
      const position = { ...(this.authoritativePositions.get(player.id) ?? spawn) };
      const target = { ...position };
      const species = playerSpriteSpecies(player);
      if (this.center3D) {
        this.avatars.set(player.id, { position, target, species });
        return;
      }
      const shadow = this.add.rectangle(0, 10, 29, 9, 0x0b2733, 0.55);
      const sprite = this.createSprite(species, 0, 13);
      const body = sprite ?? this.add.rectangle(0, 0, 26, 32, PLAYER_COLORS[slot]!).setStrokeStyle(3, 0x163246);
      const screen = mapViewportPoint(position);
      const container = this.add.container(screen.x, screen.y, [shadow, body]).setDepth(position.y);
      this.avatars.set(player.id, { container, position, target, sprite, species });
    });
  }

  private renderPatients(): void {
    const visible = new Set<string>();
    for (const patient of this.patients) {
      if (this.center3D) break;
      if (patient.lifecycle !== 'active' && patient.travelKind !== 'leaving' && patient.travelKind !== 'fainting') continue;
      const position = patientRenderPosition(patient, {
        reception: RECEPTION_SLOT_POSITIONS, waiting: WAITING_SLOT_POSITIONS,
        recovery: RECOVERY_POSITION, healingMachine: HEALING_MACHINE_POSITION,
        healingMachines: HEALING_MACHINE_POSITIONS,
      }, this.avatars.get(patient.carrierId)?.position);
      if (!position) continue;
      visible.add(patient.id);
      const carried = patient.location === 'carrier';
      const signature = `${patient.species}:${patient.location}:${patient.slotIndex}:${patient.carrierId}:${patient.travelKind}`;
      const previous = this.patientMarkers.get(patient.id);
      if (previous?.signature === signature) continue;
      previous?.container.destroy();
      const stretcher = carried ? this.textures.exists('stretcher') ? this.add.image(0, 9, 'stretcher') :
        this.add.rectangle(0, 9, 42, 16, 0xe7e3d3).setStrokeStyle(2, 0x593a30) : null;
      const sprite = this.createSprite(patient.species, 0, carried ? 8 : 12);
      const body = sprite ?? this.add.rectangle(0, carried ? 0 : -12, carried ? 40 : 28, carried ? 19 : 25,
        carried ? 0xe7e3d3 : 0xf6c76a).setStrokeStyle(2, 0x593a30);
      const screen = mapViewportPoint(position);
      const container = this.add.container(screen.x, screen.y - (carried ? 28 : 0),
        [...(stretcher ? [stretcher] : []), body]).setDepth(position.y + (carried ? 1 : 0));
      this.patientMarkers.set(patient.id, { container, signature, sprite });
    }
    for (const [id, marker] of this.patientMarkers) {
      if (visible.has(id)) continue;
      marker.container.destroy();
      this.patientMarkers.delete(id);
    }
  }

  private travelPose(patient: PatientRecord, time: number) {
    return patientTravelPose({ ...patient, travelKind: patient.travelKind,
      faintX: patient.faintX, faintY: patient.faintY, faintElevation: patient.faintElevation,
      slotIndex: patient.slotIndex, travelElapsedMs: this.patientTravelTimes.get(patient.id) ?? 0 },
    Math.min(100, Math.max(0, time - this.patientSnapshotTime)));
  }

  private faintProgress(patient: PatientRecord, time: number): number | undefined {
    return patient.travelKind === 'fainting' ? Math.min(1,
      ((this.patientTravelTimes.get(patient.id) ?? 0) + Math.min(100, Math.max(0, time - this.patientSnapshotTime))) /
      PATIENT_FAINT_DURATION_MS) : undefined;
  }

  private renderMedicines(): void {
    if (this.center3D) return;
    const visible = new Set<string>();
    for (const dose of this.medicineDoses) {
      visible.add(dose.id);
      if (this.medicineMarkers.has(dose.id)) continue;
      const bottle = this.textures.exists('medicine-bottle') ?
        this.add.image(0, 0, 'medicine-bottle') :
        this.add.rectangle(0, 0, 16, 24, dose.kind === 'burnHeal' ? 0xf28d66 : 0xa876d6)
          .setStrokeStyle(2, 0x173440);
      const icon = this.createText(0, 3, dose.kind === 'burnHeal' ? 'B' : 'A', {
        color: this.textures.exists('medicine-bottle') ? '#173440' : '#ffffff',
        fontFamily: 'monospace', fontSize: '11px', fontStyle: 'bold',
      }).setOrigin(0.5);
      const position = dose.location === 'surface' ? MEDICINE_SURFACE_POINTS[dose.slotIndex] :
        this.avatars.get(dose.carrierId)?.position;
      const screen = mapViewportPoint(position ?? { x: 480, y: 270 });
      const marker = this.add.container(screen.x, screen.y, [bottle, icon]);
      marker.setDepth((position?.y ?? 0) + 1);
      this.medicineMarkers.set(dose.id, marker);
    }
    for (const [id, marker] of this.medicineMarkers) {
      if (visible.has(id)) continue;
      marker.destroy();
      this.medicineMarkers.delete(id);
    }
    for (const dose of this.medicineDoses) {
      if (dose.location !== 'surface') continue;
      const point = MEDICINE_SURFACE_POINTS[dose.slotIndex];
      if (point) {
        const screen = mapViewportPoint(point);
        this.medicineMarkers.get(dose.id)?.setPosition(screen.x, screen.y);
      }
    }
  }

  private createText(x: number, y: number, text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text {
    return this.add.text(x, y, text, { ...style, resolution: MAX_RENDER_SCALE });
  }

  private loadPmdSprites(): void {
    const value: unknown = this.cache?.json?.get('pmd-manifest');
    if (!value) return;
    try {
      this.spriteManifest = parseSpriteManifest(value);
    } catch (error) {
      console.warn('PMD sprite cache unavailable:', error);
      return;
    }
    for (const species of this.spriteManifest.species) {
      for (const [name, animation] of [['idle', species.idle], ['walk', species.walk]] as const) {
        if (!animation) continue;
        this.load.spritesheet(`${species.name}:${name}`, `/assets/external/pmd/${animation.image}`,
          { frameWidth: animation.frameWidth, frameHeight: animation.frameHeight });
      }
    }
    this.load.once('complete', () => {
      this.spritesReady = true;
      for (const avatar of this.avatars.values()) avatar.container?.destroy();
      this.avatars.clear();
      for (const marker of this.patientMarkers.values()) marker.container.destroy();
      this.patientMarkers.clear();
      this.registerAnimations();
      if (this.center3D) {
        const images = new Map<string, CanvasImageSource>();
        for (const species of this.spriteManifest?.species ?? []) {
          for (const [name, animation] of [['idle', species.idle], ['walk', species.walk]] as const) {
            if (!animation || !this.textures.exists(`${species.name}:${name}`)) continue;
            const source = this.textures.get(`${species.name}:${name}`).source[0]?.image;
            if (source instanceof HTMLImageElement || source instanceof HTMLCanvasElement) {
              images.set(animation.image, source);
            }
          }
        }
        this.center3D.setManifest(this.spriteManifest, images);
      }
      this.renderPlayers();
      this.renderPatients();
      this.publishHud();
    });
    this.load.start();
  }

  private registerAnimations(): void {
    for (const species of this.spriteManifest?.species ?? []) {
      for (const [name, animation] of [['idle', species.idle], ['walk', species.walk]] as const) {
        if (!animation || !this.textures.exists(`${species.name}:${name}`)) continue;
        this.textures.get(`${species.name}:${name}`).setFilter(Phaser.Textures.FilterMode.NEAREST);
        for (const facing of ['down', 'right', 'up', 'left'] as const) {
          const row = animationRow(facing, animation.directions);
          const key = `${species.name}:${name}:${facing}`;
          this.anims.create({ key, repeat: -1, frameRate: 60, frames: animation.durations.map(
            (duration, index) => ({ key: `${species.name}:${name}`,
              frame: row * animation.durations.length + index,
              duration: duration * 1000 / 60 })) });
        }
      }
    }
  }

  private createSprite(species: string, x: number, y: number): Phaser.GameObjects.Sprite | undefined {
    const animation = this.spriteAnimation(species, 'idle');
    if (!this.spritesReady || !animation || !this.textures.exists(`${species}:idle`)) return undefined;
    const sprite = this.add.sprite(x, y, `${species}:idle`).setOrigin(0.5, 1);
    sprite.setScale(1);
    this.playSprite(sprite, species, 'down', false);
    return sprite;
  }

  private spriteAnimation(species: string, name: 'idle' | 'walk'): SpriteAnimation | undefined {
    return this.spriteManifest?.species.find((entry) => entry.name === species)?.[name];
  }

  private playSprite(sprite: Phaser.GameObjects.Sprite, species: string, facing: Direction,
    moving: boolean): void {
    const name = moving && this.spriteAnimation(species, 'walk') &&
      this.textures.exists(`${species}:walk`) ? 'walk' : 'idle';
    const key = `${species}:${name}:${facing}`;
    if (this.anims.exists(key) && sprite.anims.currentAnim?.key !== key) sprite.play(key);
  }

  private refreshInteraction(): void {
    const local = this.authoritativePositions.get(this.localId);
    const targets: InteractionTarget[] = [];
    if (local) {
      const carriedDose = this.medicineDoses.find((dose) => dose.id === local.carriedMedicineId);
      const medicineLabel = (patient?: PatientRecord): string => {
        if (!patient) return 'No patient';
        const needed = patientPresentation(patient).status;
        if (!carriedDose) return 'No carried medicine';
        const matches = needed === (carriedDose.kind === 'burnHeal' ? 'burned' : 'poisoned');
        return matches ? `Apply ${carriedDose.kind === 'burnHeal' ? 'Burn Heal' : 'Antidote'} to ${patient.species}` :
          'Medicine does not match';
      };
      for (let index = 0; index < MEDICINE_PREPARATION_POINTS.length; index += 1) {
        const kind = index === 0 ? 'Burn Heal' : 'Antidote';
        const owner = this.medicineOwners[index];
        const remaining = this.medicineRemainingMs[index] ?? 0;
        targets.push({ id: `medicine:prep:${index}`, position: MEDICINE_PREPARATION_POINTS[index]!,
          expectedOccupantId: '', label: owner ? owner === this.localId ?
            `Preparing ${kind} (${Math.ceil(remaining / 1000)}s)` : 'Preparation occupied' :
            local.carriedMedicineId || local.carriedPatientId ? 'Hands must be empty' :
              `Hold E: prepare ${kind}` });
      }
      for (let index = 0; index < MEDICINE_SURFACE_POINTS.length; index += 1) {
        const occupantId = this.medicineSurfaces[index] ?? '';
        const dose = this.medicineDoses.find((item) => item.id === occupantId);
        targets.push({ id: `medicine:surface:${index}`, position: MEDICINE_SURFACE_POINTS[index]!,
          expectedOccupantId: occupantId,
          label: local.carriedPatientId ? 'Hands must be empty' : local.carriedMedicineId ?
            occupantId ? 'Medicine surface occupied' : 'Place medicine' : dose ?
              `Pick up ${dose.kind === 'burnHeal' ? 'Burn Heal' : 'Antidote'}` : 'Medicine surface empty' });
      }
      targets.push({ id: 'medicine:disposal', position: MEDICINE_DISPOSAL_POINT,
        expectedOccupantId: local.carriedMedicineId ?? '',
        label: local.carriedMedicineId ? 'Discard medicine' : 'No medicine to discard' });
      for (let index = 0; index < RECEPTION_INTERACTION_POINTS.length; index += 1) {
        const occupant = this.patients.find((patient) => patient.lifecycle === 'active' &&
          patient.location === 'reception' && patient.slotIndex === index);
        targets.push({ id: carriedDose ? `medicine:apply:reception:${index}` : `reception:${index}`,
          position: RECEPTION_INTERACTION_POINTS[index]!,
          expectedOccupantId: occupant?.id ?? '',
          label: carriedDose ? medicineLabel(occupant) : local.carriedPatientId ? 'Cannot place at arrivals' :
            occupant ? `Pick up ${occupant.species}` : 'No patient' });
      }
      for (let index = 0; index < WAITING_INTERACTION_POINTS.length; index += 1) {
        const occupant = this.patients.find((patient) => patient.lifecycle === 'active' &&
          patient.location === 'waiting' && patient.slotIndex === index);
        targets.push({ id: carriedDose ? `medicine:apply:waiting:${index}` : `waiting:${index}`,
          position: WAITING_INTERACTION_POINTS[index]!,
          expectedOccupantId: occupant?.id ?? '',
          label: occupant?.travelKind ? `${occupant.species} is arriving — seat reserved` :
            carriedDose ? medicineLabel(occupant) : local.carriedPatientId ?
            occupant ? 'Slot occupied' : 'Place patient' :
            occupant ? `Pick up ${occupant.species}` : 'No patient' });
      }
      const front = this.patients.find((patient) => patient.lifecycle === 'active' &&
        patient.location === 'recovery' && patient.slotIndex === 0);
      targets.push({ id: carriedDose ? 'medicine:apply:recovery' : 'recovery',
        position: RECOVERY_INTERACTION_POINT,
        expectedOccupantId: front?.id ?? '',
        label: carriedDose ? medicineLabel(front) : local.carriedPatientId ? 'Recovery is pickup only' :
          front ? `Pick up ${front.species}` : 'Recovery empty' });
      const carried = this.patients.find((patient) => patient.id === local.carriedPatientId);
      for (const [machineIndex, machine] of [this.healingMachine, this.secondHealingMachine].entries()) {
        const machinePatient = this.patients.find((patient) => patient.id === machine.patientId);
        const machineLabel = machine.status === 'broken' ?
          local.carriedPatientId || local.carriedMedicineId ? 'Empty hands to repair outage' :
            machine.repairOwnerId ? machine.repairOwnerId === this.localId ? 'Hold E: repairing outage' :
              'Repair in progress' : 'Hold E: repair outage' :
          local.carriedPatientId ? machine.patientId ? 'Machine occupied' :
          carried && (carried.requiredTreatments & TREATMENT.healing) &&
            !(carried.completedTreatments & TREATMENT.healing) ? 'Place in healing machine' : 'Healing not needed' :
          machine.status === 'completed' && machinePatient ? `Pick up ${machinePatient.species}` :
            machine.status === 'treating' ? 'Treatment in progress' : 'Machine empty';
        targets.push({ id: carriedDose ? `medicine:apply:healing:${machineIndex}` : `healing:${machineIndex}`,
          position: HEALING_INTERACTION_POINTS[machineIndex]!,
          expectedOccupantId: machine.patientId,
          label: carriedDose && machine.status !== 'broken' ?
            machine.status === 'completed' ?
            medicineLabel(machinePatient) : 'Healing machine unavailable' : machineLabel });
      }
      targets.push({ id: 'discharge', position: DISCHARGE_INTERACTION_POINT,
        expectedOccupantId: carried?.id ?? '',
        label: carried ? patientPresentation(carried).readyForDischarge ? 'Discharge patient' :
          'Treatment still required' : 'No patient to discharge' });
    }
    const selected = local ? selectInteractionTarget(local, local.facing,
      targets.map((target) => ({ ...target, bounds: stationInteractionBounds(target.id) }))) : null;
    if (this.selectedTarget?.id !== selected?.id) this.interactionFeedback = '';
    this.selectedTarget = selected;
    this.targetHighlight.setVisible(Boolean(selected) && !this.center3D);
    if (selected) {
      const screen = mapViewportPoint(selected.position);
      this.targetHighlight.setPosition(screen.x, screen.y);
    }
    this.center3D?.setTarget(selected?.position ?? null);
    this.hudAction = this.resolveAction(local, selected);
    this.hintAction = selected && !this.interactionFeedback ? hintActionFor(selected.id, selected.label) : null;
    this.tip = this.hints.text(this.hintAction);
    const patient = this.patients.find((entry) => entry.lifecycle === 'active' &&
      entry.id === local?.carriedPatientId) ?? this.patients.find((entry) =>
      entry.lifecycle === 'active' && entry.id === selected?.expectedOccupantId);
    this.focusedPatientId = patient?.id ?? '';
    this.publishHud();
  }

  /** The E/Q prompt: a rejection, the ability being held, the selected station, or a nudge to move. */
  private resolveAction(local: PlayerPosition | undefined, selected: InteractionTarget | null): HudAction {
    if (this.interactionFeedback) {
      return { key: null, label: this.interactionFeedback, tone: 'rejected', progress: 0, ability: '' };
    }
    const ability = this.localAbility();
    const abilityRemainingMs = local?.abilityRemainingMs ?? 0;
    if (ability && abilityRemainingMs > 0) {
      return { key: 'Q', label: `${ABILITY_NAME[ability]} · ${Math.ceil(abilityRemainingMs / 1000)}s`, tone: 'hold',
        progress: Math.min(1, Math.max(0, 1 - abilityRemainingMs / ABILITY_DURATION_MS[ability])), ability: '' };
    }
    if (!selected) return IDLE_ACTION;
    const hold = selected.label.startsWith('Hold E: ');
    const preparation = /^medicine:prep:(\d)$/.exec(selected.id);
    const machine = /^healing:(\d)$/.exec(selected.id);
    let progress = 0;
    if (preparation && this.medicineOwners[Number(preparation[1])] === this.localId) {
      const durationMs = characterProfile(this.characterOf(this.localId)).preparationMs;
      progress = 1 - (this.medicineRemainingMs[Number(preparation[1])] ?? durationMs) / durationMs;
    }
    const repairing = machine ? [this.healingMachine, this.secondHealingMachine][Number(machine[1])] : undefined;
    if (repairing?.status === 'broken' && repairing.repairOwnerId === this.localId) {
      const repairMs = characterProfile(this.characterOf(this.localId)).repairMs;
      progress = 1 - (repairing.repairRemainingMs ?? repairMs) / repairMs;
    }
    const label = hold ? selected.label.slice('Hold E: '.length) : selected.label;
    const abilityName = ability && PATIENT_SLOT_TARGET.test(selected.id) && !local?.carriedPatientId &&
      !local?.carriedMedicineId ? this.abilityPrompt(ability, selected.expectedOccupantId) : '';
    return { key: 'E', label: label.charAt(0).toUpperCase() + label.slice(1),
      tone: hold || progress > 0 ? 'hold' : ACTIONABLE_LABEL.test(selected.label) ? 'ready' : 'blocked',
      progress: Math.min(1, Math.max(0, progress)), ability: abilityName };
  }

  /** The local character's ability name when it applies to the focused patient. */
  private abilityPrompt(ability: CharacterAbility, patientId: string): string {
    const patient = this.patients.find((entry) => entry.id === patientId && entry.lifecycle === 'active');
    if (!patient || patient.travelKind) return '';
    const pending = patient.requiredTreatments & ~patient.completedTreatments;
    const applies = ability === 'softBoiled' ? Boolean(pending & TREATMENT.healing) :
      patient.remainingPatienceMs < patient.initialPatienceMs;
    return applies ? ABILITY_NAME[ability] : '';
  }

  private drawMap(): void {
    if (this.center3D) return;
    this.mapArtLoaded = this.textures.exists('center-floor') && this.textures.exists('center-fixtures');
    if (this.mapArtLoaded) {
      this.add.image(480, 270, 'center-floor').setDepth(-2);
      this.add.image(480, 270, 'center-fixtures').setDepth(-1);
    } else {
      const floor = this.add.graphics();
      floor.fillStyle(0x284656).fillRect(0, 0, 960, 540);
      const corner = mapViewportPoint({ x: WALK_BOUNDS.left, y: WALK_BOUNDS.top });
      const width = (WALK_BOUNDS.right - WALK_BOUNDS.left) * MAP_2D_SCALE;
      const height = (WALK_BOUNDS.bottom - WALK_BOUNDS.top) * MAP_2D_SCALE;
      floor.fillStyle(0x7faeab).fillRect(corner.x, corner.y, width, height);
      floor.lineStyle(1, 0x6b9c99, 0.55);
      for (let x = corner.x; x <= corner.x + width; x += TILE_SIZE * MAP_2D_SCALE) {
        floor.lineBetween(x, corner.y, x, corner.y + height);
      }
      for (let y = corner.y; y <= corner.y + height; y += TILE_SIZE * MAP_2D_SCALE) {
        floor.lineBetween(corner.x, y, corner.x + width, y);
      }
    }

    this.station(MAP_OBSTACLES[0]!, 0xd8a67e);
    RECEPTION_SLOT_POSITIONS.forEach((point, index) => this.slot(point.x, point.y, index + 1));
    const discharge = mapViewportPoint(DISCHARGE_POSITION);
    if (!this.mapArtLoaded) {
      this.add.rectangle(discharge.x, discharge.y, 58 * MAP_2D_SCALE, 24 * MAP_2D_SCALE, 0x9bd59d)
        .setStrokeStyle(2, 0x426b4f);
    }
    this.createText(discharge.x, discharge.y, 'OUT', {
      color: '#173440', fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.station(MAP_OBSTACLES[1]!, 0x8abbd4);
    this.station(MAP_OBSTACLES[2]!, 0x8abbd4);
    this.station(MAP_OBSTACLES[3]!, 0xe3c58a);
    for (const [index, world] of MEDICINE_PREPARATION_POINTS.entries()) {
      const point = mapViewportPoint(world);
      this.add.rectangle(point.x, point.y, 32, 12, index === 0 ? 0xf28d66 : 0xa876d6)
        .setStrokeStyle(2, 0x244653);
      this.createText(point.x, point.y, index === 0 ? 'B' : 'A', {
        color: '#ffffff', fontFamily: 'monospace', fontSize: '11px', fontStyle: 'bold',
      }).setOrigin(0.5);
    }
    const disposal = mapViewportPoint(MEDICINE_DISPOSAL_POINT);
    this.add.rectangle(disposal.x, disposal.y, 30, 12, 0x82545b)
      .setStrokeStyle(2, 0x244653);
    this.createText(disposal.x, disposal.y, 'X', {
      color: '#ffffff', fontFamily: 'monospace', fontSize: '11px', fontStyle: 'bold',
    }).setOrigin(0.5);
    for (const [index, point] of MEDICINE_SURFACE_POINTS.entries()) this.slot(point.x, point.y, index + 1);
    for (const bench of WAITING_BENCHES) {
      this.station(bench, 0xafa1c6);
    }
    for (const [index, position] of WAITING_SLOT_POSITIONS.entries()) {
      this.slot(position.x, position.y, index + 1);
    }
    this.station(MAP_OBSTACLES[5]!, 0x9cbda2);
    this.station(MAP_OBSTACLES[6]!, 0x7faeab);

  }

  private station(obstacle: MapObstacle, color: number): void {
    const { x, y } = mapViewportPoint(obstacle);
    const width = obstacle.width * MAP_2D_SCALE;
    const height = obstacle.height * MAP_2D_SCALE;
    if (!this.mapArtLoaded) {
      this.add.rectangle(x + width / 2, y + height / 2, width, height, color)
        .setStrokeStyle(3, 0x244653);
    }

  }

  private slot(worldX: number, worldY: number, number: number): void {
    const { x, y } = mapViewportPoint({ x: worldX, y: worldY });
    if (!this.mapArtLoaded) {
      this.add.rectangle(x, y, 42 * MAP_2D_SCALE, 22 * MAP_2D_SCALE, 0xf4d9b5).setStrokeStyle(2, 0x7e5948);
    }
    this.createText(x, y, String(number), {
      color: '#583e37', fontFamily: 'monospace', fontSize: '12px',
    }).setOrigin(0.5);
  }
}
