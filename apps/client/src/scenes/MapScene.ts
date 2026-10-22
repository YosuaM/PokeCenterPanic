import { LOGICAL_WIDTH, LOGICAL_HEIGHT, MAX_RENDER_SCALE, observeRenderSize } from '../renderResolution.js';
import { MAP_2D_SCALE, mapViewportPoint } from './mapViewport.js';
import Phaser from 'phaser';
import { roundProgressLabel } from '../rooms/roundPresentation.js';
import { ContextualHints, hintActionFor, type HintAction } from './contextualHints.js';
import { ABILITY_NAME } from '../ui/characterRoles.js';
import { DISCHARGE_INTERACTION_POINT, DISCHARGE_POSITION, HEALING_DURATION_MS,
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
import { patientChecklistText, patientIndicatorState } from './patientIndicators.js';
import { indicatorPulse, PatientReadyAlerts } from './patientIndicatorAlerts.js';
import { SoftPatientAudio, PatientSoundTransitions } from './patientAlertAudio.js';
import { bindPatientAudioControls } from './patientAudioControls.js';
import { patientDistress } from './patientDistress.js';
import { visualFixture, type VisualFixture } from './visualFixtures.js';
import { Center3DView, characterElevation, type Center3DCharacter } from './center3dView.js';
import { animationRow, parseSpriteManifest, patientRenderPosition, playerSpriteSpecies,
  spriteMotion, type SpriteAnimation, type SpriteManifest } from '../sprites/pmd.js';

const PATIENT_SLOT_TARGET = /^(?:(?:reception|waiting):\d+|recovery)$/;
const PLAYER_COLORS = [0x4cc9c0, 0xf29c75, 0xb2a0f7, 0xf5ce69];

interface Avatar {
  container: Phaser.GameObjects.Container;
  position: Point;
  target: Point;
  sprite?: Phaser.GameObjects.Sprite;
  species: string;
  name: Phaser.GameObjects.Text;
}

interface IndicatorCue {
  outline: Phaser.GameObjects.Rectangle;
  ready?: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
}

interface PatientMarker {
  container: Phaser.GameObjects.Container;
  signature: string;
  cue?: IndicatorCue;
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
  private waitingDetailText!: Phaser.GameObjects.Text;
  private waitingStatusText!: Phaser.GameObjects.Text;
  private medicineDoses: MedicineDoseRecord[] = [];
  private medicineSurfaces: string[] = [];
  private medicineOwners: string[] = [];
  private medicineRemainingMs: number[] = [];
  private localId = '';
  private inputSender: ((direction: Direction | null, interactHeld: boolean, abilityHeld: boolean) => void) | null = null;
  private interactionSender: ((request: PatientInteractionRequest) => void) | null = null;
  private abilitySender: ((request: PatientInteractionRequest) => void) | null = null;
  private interactionHint!: Phaser.GameObjects.Text;
  private tipText!: Phaser.GameObjects.Text;
  private controlsLabel?: Phaser.GameObjects.Text;
  private readonly hints = new ContextualHints();
  private hintAction: HintAction | null = null;
  private patientInfoText!: Phaser.GameObjects.Text;
  private patienceText!: Phaser.GameObjects.Text;
  private patienceTrack!: Phaser.GameObjects.Rectangle;
  private patienceFill!: Phaser.GameObjects.Rectangle;
  private healthText!: Phaser.GameObjects.Text;
  private healthTrack!: Phaser.GameObjects.Rectangle;
  private healthFill!: Phaser.GameObjects.Rectangle;
  private patientStatusText!: Phaser.GameObjects.Text;
  private waitingRoster: Phaser.GameObjects.Container | null = null;
  private waitingRosterSignature = '';
  private focusedPatientId = '';
  private readonly rosterCues = new Map<string, IndicatorCue>();
  private readonly readyAlerts = new PatientReadyAlerts();
  private readonly soundTransitions = new PatientSoundTransitions();
  private patientAudio: SoftPatientAudio | null = null;
  private releaseAudioControls = () => {};
  private readyNotice!: Phaser.GameObjects.Text;
  private reducedMotion = false;
  private readonly treatmentIcons: Array<{ flag: number; image: Phaser.GameObjects.Image;
    complete: Phaser.GameObjects.Image | null }> = [];
  private readyIcon: Phaser.GameObjects.Image | null = null;
  private targetHighlight!: Phaser.GameObjects.Rectangle;
  private recoveryCount!: Phaser.GameObjects.Text;
  private fixtureDiscardAtTime: VisualFixture['discardAtTime'];
  private lastFixtureDiscard = '';
  private fixturePositionsAtTime: VisualFixture['positionsAtTime'];
  private fixturePatientsAtTime: VisualFixture['patientsAtTime'];
  private machineStatusText!: Phaser.GameObjects.Text;
  private healingTrack!: Phaser.GameObjects.Rectangle;
  private healingFill!: Phaser.GameObjects.Rectangle;
  private outageWarning!: Phaser.GameObjects.Rectangle;
  private repairTrack!: Phaser.GameObjects.Rectangle;
  private repairFill!: Phaser.GameObjects.Rectangle;
  private repairText!: Phaser.GameObjects.Text;
  private readonly preparationBars: Array<{ track: Phaser.GameObjects.Rectangle;
    fill: Phaser.GameObjects.Rectangle }> = [];
  private dischargedCountText!: Phaser.GameObjects.Text;
  private lostCountText!: Phaser.GameObjects.Text;
  private roundProgressText!: Phaser.GameObjects.Text;
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
    for (const name of ['heal', 'burn', 'poison', 'complete', 'ready']) {
      this.load.image(`icon-${name}`, `/assets/original/icon-${name}.png`);
    }
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
    this.drawHudFrame();
    this.rosterCues.clear();
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
    this.readyNotice = this.createText(480, 92, '', {
      color: '#effff4', backgroundColor: '#286650', fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: '12px', fontStyle: 'bold', padding: { x: 12, y: 7 },
    }).setOrigin(0.5).setDepth(2010).setVisible(false);
    this.treatmentIcons.length = 0;
    this.readyIcon = null;
    this.waitingRoster = null;
    this.waitingRosterSignature = '';
    this.targetHighlight = this.add.rectangle(0, 0, 42, 28, 0xffff00, 0)
      .setStrokeStyle(2, 0xffff00).setVisible(false).setDepth(1000);
    this.interactionHint = this.createText(32, 477, '', {
      color: '#ffffff', backgroundColor: '#10243bcc', fontFamily: 'monospace', fontSize: '14px', wordWrap: { width: 410 },
      padding: { x: 0, y: 0 },
    }).setDepth(2001);
    this.tipText = this.createText(32, 513, '', {
      color: '#ffde8b', fontFamily: 'Trebuchet MS, sans-serif', fontSize: '10px', fontStyle: 'bold',
    }).setDepth(2002).setVisible(false);
    this.patientInfoText = this.createText(492, 480, '', {
      color: '#f8eac8', fontFamily: 'Trebuchet MS, sans-serif', fontSize: '13px',
      lineSpacing: 3, wordWrap: { width: 432 },
    }).setDepth(2001);
    for (const [index, [flag, name]] of ([
      [TREATMENT.healing, 'heal'], [TREATMENT.burnHeal, 'burn'],
      [TREATMENT.antidote, 'poison'],
    ] as const).entries()) {
      if (!this.textures.exists(`icon-${name}`)) continue;
      const x = 858 + index * 20;
      const image = this.add.image(x, 467, `icon-${name}`).setDepth(2001).setVisible(false);
      const complete = this.textures.exists('icon-complete') ?
        this.add.image(x + 6, 473, 'icon-complete').setDepth(2002).setVisible(false) : null;
      this.treatmentIcons.push({ flag, image, complete });
    }
    if (this.textures.exists('icon-ready')) {
      this.readyIcon = this.add.image(924, 467, 'icon-ready').setDepth(2001).setVisible(false);
    }
    this.healthText = this.createText(492, 516, '', {
      color: '#9fe8cb', fontFamily: 'monospace', fontSize: '10px', fontStyle: 'bold',
    }).setDepth(2001);
    this.healthTrack = this.add.rectangle(566, 521, 82, 7, 0x355362)
      .setOrigin(0, 0.5).setDepth(2001).setVisible(false);
    this.healthFill = this.add.rectangle(566, 521, 82, 7, 0x73d8b3)
      .setOrigin(0, 0.5).setDepth(2002).setVisible(false);
    this.patientStatusText = this.createText(624, 459, '', {
      color: '#fff4df', fontFamily: 'Trebuchet MS, sans-serif', fontSize: '10px',
      fontStyle: 'bold', padding: { x: 4, y: 2 },
    }).setDepth(2001);
    this.patienceText = this.createText(666, 516, '', {
      color: '#f8d89e', fontFamily: 'monospace', fontSize: '10px', fontStyle: 'bold',
    }).setDepth(2001);
    this.patienceTrack = this.add.rectangle(824, 520, 100, 8, 0x355362)
      .setOrigin(0, 0.5).setDepth(2001).setVisible(false);
    this.patienceFill = this.add.rectangle(824, 520, 100, 8, 0xeab166)
      .setOrigin(0, 0.5).setDepth(2002).setVisible(false);
    this.recoveryCount = this.createText(260, 59, '', {
      color: '#f8eac8', backgroundColor: '#10243bcc',
      fontFamily: 'monospace', fontSize: '12px',
    });
    this.machineStatusText = this.createText(500, 33, '', {
      color: '#f8eac8',
      backgroundColor: '#10243bcc',
      fontFamily: 'monospace', fontSize: '12px',
    });
    this.healingTrack = this.add.rectangle(500,
      65, 125, 6, 0x355362)
      .setOrigin(0, 0.5).setDepth(2001).setVisible(false);
    this.healingFill = this.add.rectangle(500,
      65, 125, 6, 0xb6db9d)
      .setOrigin(0, 0.5).setDepth(2001).setVisible(false);
    const machinePoint = mapViewportPoint(HEALING_MACHINE_POSITION);
    this.outageWarning = this.add.rectangle(machinePoint.x, machinePoint.y,
      151 * MAP_2D_SCALE, 117 * MAP_2D_SCALE, 0xd74242, 0.2)
      .setStrokeStyle(4, 0xffdf6e).setVisible(false);
    this.repairTrack = this.add.rectangle(500,
      65, 125, 6, 0x355362)
      .setOrigin(0, 0.5).setDepth(2001).setVisible(false);
    this.repairFill = this.add.rectangle(500,
      65, 125, 6, 0xffdf6e)
      .setOrigin(0, 0.5).setDepth(2001).setVisible(false);
    this.repairText = this.createText(500,
      51, '', {
      color: '#ffffff', backgroundColor: '#8a2222', fontFamily: 'monospace', fontSize: '11px',
      fontStyle: 'bold', padding: { x: 3, y: 2 },
    }).setDepth(2001).setVisible(false);
    this.preparationBars.length = 0;
    for (const point of MEDICINE_PREPARATION_POINTS) {
      const projected = this.center3D?.project(point, 1.2) ?? mapViewportPoint(point);
      this.preparationBars.push({
        track: this.add.rectangle(projected.x - 30,
          projected.y, 60, 6, 0x355362)
          .setOrigin(0, 0.5).setDepth(2001).setVisible(false),
        fill: this.add.rectangle(projected.x - 30,
          projected.y, 60, 6, 0xb6db9d)
          .setOrigin(0, 0.5).setDepth(2001).setVisible(false),
      });
    }
    this.dischargedCountText = this.createText(740, 31, '', {
      color: '#f8eac8', fontFamily: 'monospace', fontSize: '13px',
    });
    for (const text of [this.recoveryCount, this.machineStatusText, this.dischargedCountText]) text.setDepth(2001);
    this.updateMachineText();
    this.updatePreparationBars();
    this.dischargedCountText.setText('DISCHARGED: 0');
    this.lostCountText = this.createText(740, 53, 'LOST: 0', {
      color: '#ff9f9f', fontFamily: 'monospace', fontSize: '13px',
    }).setDepth(2002);
    this.roundProgressText = this.createText(740, 18, roundProgressLabel(this.roundRemainingMs, this.roundScore, this.roundStreak), {
      color: '#ffde8b', fontFamily: 'monospace', fontSize: '11px',
    }).setDepth(2002);
    this.waitingStatusText = this.createText(260, 31, '', {
      color: '#f8eac8', fontFamily: 'monospace', fontSize: '11px',
      backgroundColor: '#10243bcc', padding: { x: 5, y: 3 },
    }).setDepth(2002);
    this.waitingDetailText = this.createText(260, 46, '', {
      color: '#a7c8c4', fontFamily: 'Trebuchet MS, sans-serif', fontSize: '10px',
    }).setDepth(2001);
    for (const zone of [
      { label: 'WAITING ROOM', x: 92, y: 640, height: 0.08 },
      { label: 'TREATMENT', x: 50, y: -40, height: 1.9 },
      { label: 'MEDICINES', x: 480, y: -45, height: 1.5 },
      { label: 'RECOVERY', x: 888, y: 262, height: 1.25 },
      { label: 'RECEPTION', x: 480, y: 318, height: 0.3 },
      { label: 'DISCHARGE', x: 480, y: 262, height: 1.25 },
    ]) {
      const point = this.center3D?.project(zone, zone.height) ?? mapViewportPoint(zone);
      this.createText(point.x, point.y, zone.label, { color: '#fff4df',
        backgroundColor: '#28676de6', fontFamily: 'monospace', fontSize: '10px',
        padding: { x: 5, y: 3 } }).setOrigin(0.5).setDepth(1000);
    }
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
        this.updateMachineText();
        this.updatePreparationBars();
        this.refreshInteraction();
        if (fixture.result) this.setInteractionResult(fixture.result);
      }
    }
    this.input.keyboard?.on('keydown', this.onKeyDown, this);
    this.input.keyboard?.on('keyup', this.onKeyUp, this);
    window.addEventListener('blur', this.clearMovement);
    document.addEventListener('visibilitychange', this.clearMovement);
    document.addEventListener('focusin', this.onFocusIn);
    this.events.once('shutdown', () => {
      motion?.removeEventListener('change', updateMotion);
      this.stopObservingSize();
      this.rosterCues.clear();
      this.readyAlerts.clear();
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
      this.updatePreparationBars();
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
      this.readyNotice?.setVisible(false);
    }
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
      repairOwnerId: value.repairOwnerId, repairRemainingMs: value.repairRemainingMs,
    });
    this.healingMachine = copy(machine);
    this.secondHealingMachine = copy(second);
    if (this.sys.isActive()) {
      this.updateMachineText();
      this.refreshInteraction();
    }
  }

  setDischargedCount(count: number): void {
    if (this.sys.isActive()) this.dischargedCountText.setText(`DISCHARGED: ${count}`);
  }

  setLostCount(count: number): void {
    if (this.sys.isActive()) this.lostCountText.setText(`LOST: ${count}`);
  }

  setRoundProgress(remainingMs: number, score: number, streak = 0): void {
    this.roundRemainingMs = remainingMs;
    this.roundScore = score;
    this.roundStreak = streak;
    if (this.sys.isActive()) this.roundProgressText?.setText(roundProgressLabel(remainingMs, score, streak));
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
    this.updatePatientIndicatorAlerts(time);
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
    if (this.healingMachine.status === 'broken' || this.secondHealingMachine.status === 'broken') {
      this.outageWarning.setAlpha(0.38 + 0.18 * Math.sin(time / 180));
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
    for (const [id, avatar] of this.avatars) {
      const next = {
        x: avatar.position.x + (avatar.target.x - avatar.position.x) * blend,
        y: avatar.position.y + (avatar.target.y - avatar.position.y) * blend,
      };
      avatar.position = isWalkable(next) ? next : { ...avatar.target };
      const labelPosition = this.center3D?.project(avatar.position, 2.05) ?? mapViewportPoint(avatar.position);
      avatar.container.setPosition(labelPosition.x, labelPosition.y);
      avatar.container.setDepth(this.center3D ? 1001 : avatar.position.y);
      avatar.name.setY(this.center3D ? -16 :
        this.authoritativePositions.get(id)?.carriedPatientId ? -77 : -31);
      if (avatar.sprite) {
        const motion = spriteMotion(this.authoritativePositions.get(id), avatar.position, avatar.target);
        this.playSprite(avatar.sprite, avatar.species, motion.facing, motion.moving);
      }
    }
    for (const patient of this.patients) {
      const travel = this.travelPose(patient, time);
      if (travel && !this.center3D) {
        const marker = this.patientMarkers.get(patient.id);
        const screen = mapViewportPoint(travel.point);
        marker?.container.setPosition(screen.x, screen.y);
        marker?.container.setDepth(travel.point.y);
        if (marker?.sprite) this.playSprite(marker.sprite, patient.species, travel.facing, travel.moving);
        const faint = this.faintProgress(patient, time);
        if (marker && faint !== undefined) {
          const distress = patientDistress(0, time, faint);
          marker.container.setAlpha(distress.opacity).setRotation(distress.roll);
        }
      }
      if (patient.location !== 'carrier') continue;
      const avatar = this.avatars.get(patient.carrierId);
      const marker = this.patientMarkers.get(patient.id);
      if (avatar && marker) {
        if (!this.center3D) {
          const screen = mapViewportPoint(avatar.position);
          marker.container.setPosition(screen.x, screen.y - 28);
          marker.container.setDepth(avatar.position.y + 1);
        }
        if (marker.sprite) {
          const facing = this.authoritativePositions.get(patient.carrierId)?.facing ?? 'down';
          this.playSprite(marker.sprite, patient.species, facing, false);
        }
      }
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
      const entities: Center3DCharacter[] = [];
      for (const [id, avatar] of this.avatars) {
        const motion = spriteMotion(this.authoritativePositions.get(id), avatar.position, avatar.target);
        entities.push({ id: `player:${id}`, species: avatar.species, point: avatar.position,
          elevation: 0.03, facing: motion.facing, moving: motion.moving, isPlayer: true,
          carried: false });
      }
      for (const patient of this.patients) {
        const travel = this.travelPose(patient, time);
        const point = travel?.point ?? patientRenderPosition(patient, {
          reception: RECEPTION_SLOT_POSITIONS, waiting: WAITING_SLOT_POSITIONS,
          recovery: RECOVERY_POSITION, healingMachine: HEALING_MACHINE_POSITION,
          healingMachines: HEALING_MACHINE_POSITIONS,
        }, this.avatars.get(patient.carrierId)?.position);
        if (!point) continue;
        const elevation = travel?.elevation ?? characterElevation(patient.location);
        const facing = travel?.facing ?? (patient.location === 'carrier' ?
          this.authoritativePositions.get(patient.carrierId)?.facing ?? 'down' : 'down');
        entities.push({ id: `patient:${patient.id}`, species: patient.species, point,
          elevation, facing, moving: travel?.moving ?? false, isPlayer: false,
          carried: patient.location === 'carrier', patienceRatio: patientPatienceRatio(patient),
          faintProgress: this.faintProgress(patient, time) });
        const marker = this.patientMarkers.get(patient.id);
        if (marker) {
          const label = this.center3D.project(point, elevation + 1.45);
          marker.container.setPosition(label.x, label.y);
          marker.container.setDepth(1001);
        }
      }
      this.center3D.syncCharacters(entities, time);
      this.center3D.syncMedicines(this.medicineDoses,
        new Map([...this.avatars].map(([id, avatar]) => [id, avatar.position])), time);
      this.center3D.render(time, [this.healingMachine.status, this.secondHealingMachine.status], this.medicineOwners, this.patients);
    }
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
        avatar.container.destroy();
        this.avatars.delete(id);
        this.authoritativePositions.delete(id);
      }
    }
    this.players.forEach((player) => {
      const existing = this.avatars.get(player.id);
      if (existing?.species === playerSpriteSpecies(player)) return;
      if (existing) {
        existing.container.destroy();
        this.avatars.delete(player.id);
      }
      const slot = player.slot;
      const spawn = SPAWN_POINTS[slot];
      if (!spawn) return;
      const position = { ...(this.authoritativePositions.get(player.id) ?? spawn) };
      const target = { ...position };
      const color = PLAYER_COLORS[slot]!;
      const shadow = this.center3D ? null : this.add.rectangle(0, 10, 29, 9, 0x0b2733, 0.55);
      const species = playerSpriteSpecies(player);
      const sprite = this.center3D ? undefined : this.createSprite(species, 0, 13);
      const body = this.center3D ? null : sprite ??
        this.add.rectangle(0, 0, 26, 32, color).setStrokeStyle(3, 0x163246);
      const badge = this.createText(0, 0, String(slot + 1), {
        color: '#10243b', fontFamily: 'monospace', fontSize: '15px', fontStyle: 'bold',
      }).setOrigin(0.5);
      const name = this.createText(0, -31, player.name, {
        color: '#ffffff', backgroundColor: '#10243bcc', fontFamily: 'monospace', fontSize: '12px',
        padding: { x: 4, y: 2 },
      }).setOrigin(0.5);
      const screen = mapViewportPoint(position);
      const container = this.add.container(screen.x, screen.y,
        [...(shadow ? [shadow] : []), ...(body ? [body] : []), badge, name])
        .setDepth(position.y);
      this.avatars.set(player.id, { container, position, target, sprite, species, name });
    });
  }

  private renderPatients(): void {
    const visible = new Set<string>();
    for (const patient of this.patients) {
      if (patient.lifecycle !== 'active' && patient.travelKind !== 'leaving' && patient.travelKind !== 'fainting') continue;
      const position = patientRenderPosition(patient, {
        reception: RECEPTION_SLOT_POSITIONS, waiting: WAITING_SLOT_POSITIONS,
        recovery: RECOVERY_POSITION, healingMachine: HEALING_MACHINE_POSITION,
        healingMachines: HEALING_MACHINE_POSITIONS,
      }, this.avatars.get(patient.carrierId)?.position);
      if (!position) continue;
      visible.add(patient.id);
      const presentation = patientPresentation(patient);
      const patience = patientPatienceRatio(patient);
      const seconds = Math.ceil(patient.remainingPatienceMs / 1000);
      const signature = `${patient.species}:${patient.location}:${patient.slotIndex}:${patient.carrierId}:${presentation.hp}:${presentation.status}:${patient.travelKind}:${seconds}:${patience <= 0.25}:${patience <= 0.5}:${presentation.readyForDischarge}`;
      const previous = this.patientMarkers.get(patient.id);
      if (previous?.signature === signature) continue;
      previous?.container.destroy();
      const carried = patient.location === 'carrier';
      const stretcher = this.center3D ? null : carried ? this.textures.exists('stretcher') ?
        this.add.image(0, 9, 'stretcher') :
        this.add.rectangle(0, 9, 42, 16, 0xe7e3d3).setStrokeStyle(2, 0x593a30) : null;
      const sprite = this.center3D ? undefined : this.createSprite(patient.species, 0, carried ? 8 : 12);
      const body = this.center3D ? null : sprite ??
        this.add.rectangle(0, carried ? 0 : -12, carried ? 40 : 28, carried ? 19 : 25,
        carried ? 0xe7e3d3 : 0xf6c76a).setStrokeStyle(2, 0x593a30);
      const waiting = patient.location === 'waiting';
      const pending = patient.requiredTreatments & ~patient.completedTreatments;
      const iconNames = pending ? ([
        [TREATMENT.healing, 'heal'], [TREATMENT.burnHeal, 'burn'],
        [TREATMENT.antidote, 'poison'],
      ] as const).filter(([flag]) => pending & flag).map(([, name]) => name) :
        presentation.readyForDischarge ? ['ready'] : [];
      const badges = iconNames.filter((name) => this.textures.exists(`icon-${name}`))
        .map((name, index, names) => this.add.image((index - (names.length - 1) / 2) * 12,
          this.center3D ? -14 : patient.location === 'reception' ? -54 : carried ? -43 : -36,
          `icon-${name}`).setDisplaySize(12, 12));
      const label = this.createText(0, this.center3D ? 0 : patient.location === 'reception' ? -37 :
        carried ? -26 : 31,
        patient.travelKind === 'fainting' ? `${patient.species} · FAINTED` :
          patient.travelKind === 'leaving' ? `${patient.species} · BYE!` :
          patient.travelKind === 'arriving' ? `${patient.species} · ARRIVING` :
          waiting ? `#${patient.slotIndex + 1}${patience <= 0.25 ? '!' : presentation.readyForDischarge ? '>' : ''}` : `${patience <= 0.25 ? '! ' : ''}${presentation.readyForDischarge ? 'READY' : `HP ${presentation.hp}`}`, {
        color: '#ffffff', backgroundColor: patient.lifecycle === 'lost' || patience <= 0.25 ? '#8a2222' :
          patience <= 0.5 ? '#79501f' : '#10243bcc', fontFamily: 'monospace',
        fontSize: '9px',
        padding: { x: waiting ? 1 : 3, y: 2 },
      }).setOrigin(0.5);
      const bars = patient.lifecycle === 'active' ? [
        this.add.rectangle(-12, this.center3D ? -31 : 44, 24, 3, 0x263d49).setOrigin(0, 0.5),
        this.add.rectangle(-12, this.center3D ? -31 : 44, 24 * presentation.hp / 100, 3,
          0x73d8b3).setOrigin(0, 0.5),
        this.add.rectangle(-12, this.center3D ? -26 : 50, 24, 3, 0x263d49).setOrigin(0, 0.5),
        this.add.rectangle(-12, this.center3D ? -26 : 50, 24 * patience, 3,
          patience <= 0.25 ? 0xe87970 : 0xeab166).setOrigin(0, 0.5),
      ] : [];
      const cue = patient.lifecycle === 'active' && (patience <= 0.25 || presentation.readyForDischarge) ? {
        outline: this.add.rectangle(0, this.center3D ? 0 : patient.location === 'reception' ? -37 :
          carried ? -26 : 31, waiting ? 28 : 48, 16, 0, 0)
          .setStrokeStyle(2, patience <= 0.25 ? 0xff8a7a : 0x9fe8cb),
        ready: badges[iconNames.indexOf('ready')],
      } : undefined;
      const screen = mapViewportPoint(position);
      const container = this.add.container(screen.x, screen.y - (carried ? 28 : 0),
        [...(stretcher ? [stretcher] : []), ...(body ? [body] : []), ...(cue ? [cue.outline] : []), ...badges, label, ...bars])
        .setDepth(position.y + (carried ? 1 : 0));
      this.patientMarkers.set(patient.id, { container, signature, sprite, cue });
    }
    for (const [id, marker] of this.patientMarkers) {
      if (visible.has(id)) continue;
      marker.container.destroy();
      this.patientMarkers.delete(id);
    }
    this.recoveryCount.setText(`Recovery: ${this.patients.filter((patient) =>
      patient.lifecycle === 'active' && patient.location === 'recovery').length}`);
    const waiting = this.patients.filter((patient) => patient.lifecycle === 'active' && patient.location === 'waiting');
    const arriving = waiting.filter((patient) => patient.travelKind === 'arriving').length;
    this.waitingStatusText.setText(`WAITING ${waiting.length}/${WAITING_SLOT_POSITIONS.length}` +
      (waiting.length === WAITING_SLOT_POSITIONS.length ? ' · FULL' : ''));
    this.waitingDetailText.setText(`${waiting.length - arriving} seated · ${arriving} arriving`);
    this.renderWaitingRoster();
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
      for (const avatar of this.avatars.values()) avatar.container.destroy();
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
    this.updateMachineText();
    this.targetHighlight.setVisible(Boolean(selected) && !this.center3D);
    if (selected) {
      const screen = mapViewportPoint(selected.position);
      this.targetHighlight.setPosition(screen.x, screen.y);
    }
    this.center3D?.setTarget(selected?.position ?? null);
    const ability = this.localAbility();
    const abilityRemainingMs = local?.abilityRemainingMs ?? 0;
    const abilityPrompt = ability && selected && PATIENT_SLOT_TARGET.test(selected.id) && !local?.carriedPatientId &&
      !local?.carriedMedicineId ? this.abilityPrompt(ability, selected.expectedOccupantId) : '';
    this.interactionHint.setText(this.interactionFeedback ? `REJECTED: ${this.interactionFeedback}` :
      ability && abilityRemainingMs > 0 ? `${ABILITY_NAME[ability]}… ${Math.ceil(abilityRemainingMs / 1000)}s` :
        selected ? `${selected.id.startsWith('medicine:prep:') || selected.label.startsWith('Hold E:') ?
          selected.label : `E: ${selected.label}`}${abilityPrompt}` : 'Approach a station or patient');
    this.interactionHint.setStyle({ backgroundColor: this.interactionFeedback ? '#8a2222' : '#10243bcc',
      color: '#ffffff' });
    this.hintAction = selected && !this.interactionFeedback ? hintActionFor(selected.id, selected.label) : null;
    const tip = this.hints.text(this.hintAction);
    this.tipText.setText(tip).setVisible(Boolean(tip));
    this.controlsLabel?.setVisible(!tip);
    const patient = this.patients.find((entry) => entry.lifecycle === 'active' &&
      entry.id === local?.carriedPatientId) ?? this.patients.find((entry) =>
      entry.lifecycle === 'active' && entry.id === selected?.expectedOccupantId);
    this.patientInfoText.setText(patient ? patientChecklistText(patient) : 'No patient selected\nApproach a Pokémon to view its care needs.');
    for (const { flag, image, complete } of this.treatmentIcons) {
      const required = Boolean(patient && patient.requiredTreatments & flag);
      const done = Boolean(required && patient && patient.completedTreatments & flag);
      image.setVisible(required).setAlpha(done ? 0.55 : 1);
      complete?.setVisible(done);
    }
    this.readyIcon?.setVisible(Boolean(patient && patientPresentation(patient).readyForDischarge));
    const state = patient ? patientIndicatorState(patient) : null;
    const paused = patient && [this.healingMachine, this.secondHealingMachine].some((machine) =>
      machine.patientId === patient.id && machine.status === 'treating');
    const status = !state ? '' : paused ? 'HEALING · WAIT PAUSED' : state.critical ?
      state.ready ? '! CRITICAL · DISCHARGE' : '! CRITICAL' : state.ready ? 'READY FOR DISCHARGE' :
        state.warning ? 'LOSING PATIENCE' : 'AWAITING CARE';
    this.patientStatusText.setVisible(Boolean(state)).setText(status).setStyle({
      color: '#fff4df', backgroundColor: state?.critical ? '#8a2222' :
        state?.ready ? '#286650' : paused ? '#245a76' : '#304c55',
    });
    this.healthText.setText(state ? `HP ${state.hp}/100` : '');
    this.healthTrack.setVisible(Boolean(state));
    this.healthFill.setVisible(Boolean(state && state.hp > 0)).setDisplaySize(82 * (state?.hp ?? 0) / 100, 7);
    this.patienceText.setText(state ? `WAIT ${Math.ceil(state.patience * 100)}% · ${state.seconds}s` : '');
    this.patienceTrack.setVisible(Boolean(state));
    this.patienceFill.setVisible(Boolean(state && state.patience > 0));
    this.patienceFill.setDisplaySize(100 * (state?.patience ?? 0), 8)
      .setFillStyle(paused ? 0x92c7f3 : state?.critical ? 0xe87970 : 0xeab166);
    this.focusedPatientId = patient?.id ?? '';
    this.renderWaitingRoster();
  }

  /** Suffix advertising the local character's ability when it applies to the focused patient. */
  private abilityPrompt(ability: CharacterAbility, patientId: string): string {
    const patient = this.patients.find((entry) => entry.id === patientId && entry.lifecycle === 'active');
    if (!patient || patient.travelKind) return '';
    const pending = patient.requiredTreatments & ~patient.completedTreatments;
    const applies = ability === 'softBoiled' ? Boolean(pending & TREATMENT.healing) :
      patient.remainingPatienceMs < patient.initialPatienceMs;
    return applies ? ` · Q: ${ABILITY_NAME[ability]}` : '';
  }

  private renderWaitingRoster(): void {
    const seats = WAITING_SLOT_POSITIONS.map((_, slot) => this.patients.find((patient) =>
      patient.lifecycle === 'active' && patient.location === 'waiting' && patient.slotIndex === slot));
    const states = seats.map((patient) => patient ? patientIndicatorState(patient) : null);
    const signature = JSON.stringify([this.focusedPatientId, seats.map((patient, slot) => patient ?
      [patient.id, patient.species, patient.travelKind, patient.requiredTreatments,
        patient.completedTreatments, states[slot]?.hp, states[slot]?.seconds, states[slot]?.critical,
        Math.ceil((states[slot]?.patience ?? 0) * 100)] : null)]);
    if (signature === this.waitingRosterSignature) return;
    this.waitingRosterSignature = signature;
    this.waitingRoster?.destroy();
    this.rosterCues.clear();
    const children: Phaser.GameObjects.GameObject[] = [];
    seats.forEach((patient, slot) => {
      const top = 125 + slot * 36;
      const state = states[slot];
      const selected = Boolean(patient && patient.id === this.focusedPatientId);
      children.push(this.add.rectangle(22, top, 118, 33,
        state?.critical ? 0x542b30 : selected ? 0x294b52 : 0x173943)
        .setOrigin(0, 0).setStrokeStyle(selected ? 2 : 1,
          selected ? 0xffde8b : state?.critical ? 0xe87970 : 0x35545d));
      children.push(this.createText(27, top + 3, `${slot + 1}${state?.critical ? '!' : patient?.travelKind === 'arriving' ? '>' : ''}`, {
        fontFamily: 'monospace', fontSize: '9px', fontStyle: 'bold', color: '#fff0cf',
      }));
      children.push(this.createText(44, top + 3, patient ? patient.species.toUpperCase() : 'EMPTY', {
        fontFamily: 'Trebuchet MS, sans-serif', fontSize: '9px', fontStyle: 'bold',
        color: patient ? '#fff4df' : '#739398',
      }));
      if (!state) return;
      let cue: IndicatorCue | undefined;
      if (state.critical || state.ready) {
        cue = { outline: this.add.rectangle(24, top + 2, 114, 29, 0, 0)
          .setOrigin(0, 0).setStrokeStyle(2, state.critical ? 0xff8a7a : 0x9fe8cb) };
        this.rosterCues.set(patient!.id, cue);
        children.push(cue.outline);
      }
      const icons = state.ready ? [{ icon: 'ready', fallback: '>' }] : state.icons;
      icons.forEach(({ icon, fallback }, index) => {
        const x = 131 - (icons.length - 1 - index) * 13;
        const badge = this.textures.exists(`icon-${icon}`) ?
          this.add.image(x, top + 8, `icon-${icon}`).setDisplaySize(11, 11) :
          this.createText(x, top + 8, fallback, { color: '#fff4df', fontFamily: 'monospace',
            fontSize: '10px', fontStyle: 'bold' }).setOrigin(0.5);
        children.push(badge);
        if (cue && icon === 'ready') cue.ready = badge;
      });
      children.push(this.createText(27, top + 15, `HP ${state.hp}`, {
        fontFamily: 'monospace', fontSize: '8px', color: '#9fe8cb',
      }));
      children.push(this.createText(83, top + 15, `WAIT ${state.seconds}s`, {
        fontFamily: 'monospace', fontSize: '8px', color: state.critical ? '#ffb2a8' : '#f8d89e',
      }));
      for (const [x, ratio, color] of [[27, state.hp / 100, 0x73d8b3],
        [83, state.patience, state.critical ? 0xe87970 : 0xeab166]] as const) {
        children.push(this.add.rectangle(x, top + 28, 50, 3, 0x355362).setOrigin(0, 0.5));
        if (ratio > 0) children.push(this.add.rectangle(x, top + 28, 50 * ratio, 3, color).setOrigin(0, 0.5));
      }
    });
    this.waitingRoster = this.add.container(0, 0, children).setDepth(2001);
  }

  private updatePatientIndicatorAlerts(time: number): void {
    const steady = this.reducedMotion || !this.gameplayActive;
    let focusedPulse = indicatorPulse(time, false, false, steady);
    for (const patient of this.patients) {
      if (patient.lifecycle !== 'active') continue;
      const state = patientIndicatorState(patient);
      const pulse = indicatorPulse(time, state.critical, state.ready, steady);
      for (const cue of [this.patientMarkers.get(patient.id)?.cue, this.rosterCues.get(patient.id)]) {
        cue?.outline.setAlpha(pulse.outlineAlpha);
        cue?.ready?.setAlpha(pulse.readyAlpha);
      }
      if (patient.id === this.focusedPatientId) focusedPulse = pulse;
    }
    this.patientStatusText?.setAlpha(0.8 + 0.2 * focusedPulse.criticalAlpha);
    this.patienceFill?.setAlpha(focusedPulse.criticalAlpha);
    this.readyIcon?.setAlpha(focusedPulse.readyAlpha);
    const notice = this.readyAlerts.at(time, steady);
    this.readyNotice?.setVisible(Boolean(notice)).setText(notice ? `> ${notice.text}` : '')
      .setAlpha(notice?.alpha ?? 1);
  }

  private updateMachineText(): void {
    const machines = [this.healingMachine, this.secondHealingMachine];
    const brokenIndex = machines.findIndex((machine) => machine.status === 'broken');
    const selected = /healing:([01])$/.exec(this.selectedTarget?.id ?? '');
    const index = brokenIndex >= 0 ? brokenIndex : selected ? Number(selected[1]) : 0;
    const machine = machines[index]!;
    this.machineStatusText.setText(machine.status === 'broken' ?
      machine.patientId && machine.remainingMs > 0 ?
        `PAUSED ${Math.ceil(machine.remainingMs / 1000)}s` : 'OFFLINE' :
      machine.status === 'treating' ?
      `${Math.ceil(machine.remainingMs / 1000)}s LEFT` :
      machine.status === 'completed' ? 'READY' : 'MACHINE EMPTY');
    const treating = machine.status === 'treating';
    const broken = machine.status === 'broken';
    const progress = treating ? 1 - Math.min(1, Math.max(0,
      machine.remainingMs / (machine.durationMs || HEALING_DURATION_MS))) : 0;
    this.healingTrack.setVisible(treating);
    this.healingFill.setVisible(treating && progress > 0).setDisplaySize(125 * progress, 6);
    this.outageWarning.setVisible(broken && !this.center3D);
    const point = mapViewportPoint(HEALING_MACHINE_POSITIONS[index]!);
    this.outageWarning.setPosition(point.x, point.y);
    const repairing = broken && Boolean(machine.repairOwnerId);
    const repairMs = characterProfile(this.characterOf(machine.repairOwnerId)).repairMs;
    const repairProgress = repairing ? 1 - Math.min(1, Math.max(0,
      (machine.repairRemainingMs ?? repairMs) / repairMs)) : 0;
    this.repairTrack.setVisible(repairing);
    this.repairFill.setVisible(repairing && repairProgress > 0).setDisplaySize(125 * repairProgress, 6);
    this.repairText.setVisible(broken).setText(broken ? repairing ?
      `OUTAGE · REPAIR ${Math.ceil((machine.repairRemainingMs ?? repairMs) / 1000)}s` :
      'OUTAGE · HOLD E TO REPAIR' : '');
  }

  private updatePreparationBars(): void {
    for (const [index, bar] of this.preparationBars.entries()) {
      const preparing = Boolean(this.medicineOwners[index]);
      const durationMs = characterProfile(this.characterOf(this.medicineOwners[index])).preparationMs;
      const progress = preparing ? 1 - Math.min(1, Math.max(0,
        (this.medicineRemainingMs[index] ?? durationMs) / durationMs)) : 0;
      bar.track.setVisible(preparing);
      bar.fill.setVisible(preparing && progress > 0).setDisplaySize(60 * progress, 6);
    }
  }

  private drawHudFrame(): void {
    const panel = (x: number, y: number, width: number, height: number) => {
      this.add.rectangle(x, y, width, height, 0x102f39, 0.98)
        .setOrigin(0, 0).setStrokeStyle(1, 0x456b70).setDepth(2000);
      this.add.rectangle(x, y, 3, height, 0x80c9b8).setOrigin(0, 0).setDepth(2001);
    };
    panel(16, 12, 928, 64);
    panel(16, 92, 130, 326);
    panel(16, 452, 448, 76);
    panel(478, 452, 466, 76);
    const label = (x: number, y: number, value: string, size = 10, color = '#9cc4bf') =>
      this.createText(x, y, value, { color, fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: `${size}px`, fontStyle: 'bold' }).setDepth(2001);
    this.add.rectangle(40, 36, 20, 6, 0x9cddc5).setDepth(2001);
    this.add.rectangle(40, 36, 6, 20, 0x9cddc5).setDepth(2001);
    label(60, 24, 'POKÉCENTER', 17, '#fff1d5');
    label(60, 47, 'PANIC  /  CLINIC 01', 10);
    label(260, 18, 'WAITING ROOM');
    label(500, 18, 'HEALING MACHINES');
    label(32, 461, 'NEXT ACTION');
    this.controlsLabel = label(32, 513, 'WASD / ARROWS  Move     E  Interact / hold     Q  Ability');
    label(492, 461, 'PATIENT FILE');
    label(26, 101, 'WAITING PATIENTS', 11);
    label(26, 116, '> Ready   ! Urgent', 8);
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
