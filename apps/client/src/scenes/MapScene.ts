import Phaser from 'phaser';
import { DISCHARGE_INTERACTION_POINT, DISCHARGE_POSITION, HEALING_INTERACTION_POINT,
  HEALING_MACHINE_POSITION, MAP_OBSTACLES, RECOVERY_INTERACTION_POINT, RECOVERY_POSITION,
  RECEPTION_INTERACTION_POINTS, RECEPTION_SLOT_POSITIONS, SPAWN_POINTS, TILE_SIZE,
  TREATMENT, WAITING_INTERACTION_POINTS, WAITING_SLOT_POSITIONS, patientPresentation,
  selectInteractionTarget, type Direction, type HealingMachineSnapshot,
  type InteractionTarget, type MapObstacle, type PatientInteractionRequest,
  type PatientInteractionResult, type PatientRecord, type PlayerPosition, type PlayerPresence, type Point } from '@pokecenter/shared';
import { MovementInput } from './movement.js';
const PLAYER_COLORS = [0x4cc9c0, 0xf29c75, 0xb2a0f7, 0xf5ce69];

interface Avatar {
  container: Phaser.GameObjects.Container;
  position: Point;
  target: Point;
}

interface PatientMarker {
  container: Phaser.GameObjects.Container;
  signature: string;
}

export class MapScene extends Phaser.Scene {
  private readonly movement = new MovementInput();
  private readonly avatars = new Map<string, Avatar>();
  private readonly patientMarkers = new Map<string, PatientMarker>();
  private readonly authoritativePositions = new Map<string, PlayerPosition>();
  private players: PlayerPresence[] = [];
  private patients: PatientRecord[] = [];
  private localId = '';
  private inputSender: ((direction: Direction | null) => void) | null = null;
  private interactionSender: ((request: PatientInteractionRequest) => void) | null = null;
  private interactionHint!: Phaser.GameObjects.Text;
  private targetHighlight!: Phaser.GameObjects.Rectangle;
  private recoveryCount!: Phaser.GameObjects.Text;
  private machineStatusText!: Phaser.GameObjects.Text;
  private dischargedCountText!: Phaser.GameObjects.Text;
  private healingMachine: HealingMachineSnapshot = { patientId: '', status: 'empty', remainingMs: 0 };
  private selectedTarget: InteractionTarget | null = null;
  private interactionFeedback = '';
  private lastSentAt = -Infinity;
  private lastSentDirection: Direction | null = null;

  constructor() {
    super('map');
  }

  create(): void {
    this.drawMap();
    this.targetHighlight = this.add.rectangle(0, 0, 42, 28, 0xffff00, 0)
      .setStrokeStyle(2, 0xffff00).setVisible(false).setDepth(1000);
    this.interactionHint = this.add.text(26, 477, '', {
      color: '#ffffff', backgroundColor: '#10243bcc', fontFamily: 'monospace', fontSize: '13px',
      padding: { x: 5, y: 3 },
    }).setDepth(1001);
    this.recoveryCount = this.add.text(650, 423, '', {
      color: '#173440', fontFamily: 'monospace', fontSize: '12px',
    });
    this.machineStatusText = this.add.text(94, 252, '', {
      color: '#173440', fontFamily: 'monospace', fontSize: '12px',
    });
    this.dischargedCountText = this.add.text(760, 505, '', {
      color: '#f8eac8', fontFamily: 'monospace', fontSize: '13px',
    });
    this.updateMachineText();
    this.dischargedCountText.setText('DISCHARGED: 0');
    this.renderPlayers();
    this.renderPatients();
    this.input.keyboard?.on('keydown', this.onKeyDown, this);
    this.input.keyboard?.on('keyup', this.onKeyUp, this);
    window.addEventListener('blur', this.clearMovement);
    document.addEventListener('visibilitychange', this.clearMovement);
    document.addEventListener('focusin', this.onFocusIn);
    this.events.once('shutdown', () => {
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
    this.setPlayers([], '');
    this.setPatients([]);
    this.inputSender = null;
    this.interactionSender = null;
    this.interactionFeedback = '';
    this.refreshInteraction();
  }

  setPatients(patients: PatientRecord[]): void {
    this.patients = patients;
    if (this.sys.isActive()) {
      this.renderPatients();
      this.refreshInteraction();
    }
  }

  setInputSender(sender: (direction: Direction | null) => void): void {
    this.inputSender = sender;
  }

  setInteractionSender(sender: (request: PatientInteractionRequest) => void): void {
    this.interactionSender = sender;
  }

  setInteractionResult(result: PatientInteractionResult): void {
    this.interactionFeedback = result.ok ? '' : result.reason;
    this.refreshInteraction();
  }

  setHealingMachine(machine: HealingMachineSnapshot): void {
    this.healingMachine = machine;
    if (this.sys.isActive()) {
      this.updateMachineText();
      this.refreshInteraction();
    }
  }

  setDischargedCount(count: number): void {
    if (this.sys.isActive()) this.dischargedCountText.setText(`DISCHARGED: ${count}`);
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
    const direction = this.movement.direction;
    if (this.avatars.has(this.localId) && this.inputSender && time - this.lastSentAt >= 50 &&
      (direction !== this.lastSentDirection || direction !== null)) {
      this.inputSender(direction);
      this.lastSentDirection = direction;
      this.lastSentAt = time;
    }
    const blend = Math.min(1, Math.max(0, delta) / 70);
    for (const avatar of this.avatars.values()) {
      avatar.position.x += (avatar.target.x - avatar.position.x) * blend;
      avatar.position.y += (avatar.target.y - avatar.position.y) * blend;
      avatar.container.setPosition(avatar.position.x, avatar.position.y);
      avatar.container.setDepth(avatar.position.y);
    }
    for (const patient of this.patients) {
      if (patient.location !== 'carrier') continue;
      const avatar = this.avatars.get(patient.carrierId);
      const marker = this.patientMarkers.get(patient.id);
      if (avatar && marker) {
        marker.container.setPosition(avatar.position.x, avatar.position.y - 28);
        marker.container.setDepth(avatar.position.y + 1);
      }
    }
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.avatars.has(this.localId) || this.isTyping()) return;
    if (event.code === 'KeyE') {
      event.preventDefault();
      if (event.repeat) return;
      if (this.selectedTarget) {
        this.interactionSender?.({
          targetId: this.selectedTarget.id,
          expectedOccupantId: this.selectedTarget.expectedOccupantId,
        });
      } else {
        this.interactionFeedback = 'No target in range';
        this.refreshInteraction();
      }
      return;
    }
    if (this.movement.press(event.code)) event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.movement.release(event.code);
  };

  private readonly clearMovement = (): void => {
    this.movement.clear();
    if (this.lastSentDirection !== null) {
      this.inputSender?.(null);
      this.lastSentDirection = null;
    }
  };

  private readonly onFocusIn = (): void => {
    if (this.isTyping()) this.clearMovement();
  };

  private isTyping(): boolean {
    const focused = document.activeElement;
    return focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement;
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
      if (this.avatars.has(player.id)) return;
      const slot = player.slot;
      const spawn = SPAWN_POINTS[slot];
      if (!spawn) return;
      const position = { ...(this.authoritativePositions.get(player.id) ?? spawn) };
      const target = { ...position };
      const color = PLAYER_COLORS[slot]!;
      const shadow = this.add.rectangle(0, 10, 29, 9, 0x0b2733, 0.55);
      const body = this.add.rectangle(0, 0, 26, 32, color).setStrokeStyle(3, 0x163246);
      const badge = this.add.text(0, 0, String(slot + 1), {
        color: '#10243b', fontFamily: 'monospace', fontSize: '15px', fontStyle: 'bold',
      }).setOrigin(0.5);
      const name = this.add.text(0, -31, player.name, {
        color: '#ffffff', backgroundColor: '#10243bcc', fontFamily: 'monospace', fontSize: '12px',
        padding: { x: 4, y: 2 },
      }).setOrigin(0.5);
      const container = this.add.container(position.x, position.y, [shadow, body, badge, name])
        .setDepth(position.y);
      this.avatars.set(player.id, { container, position, target });
    });
  }

  private renderPatients(): void {
    const visible = new Set<string>();
    for (const patient of this.patients) {
      if (patient.lifecycle !== 'active') continue;
      const position = patient.location === 'reception' ? RECEPTION_SLOT_POSITIONS[patient.slotIndex] :
        patient.location === 'waiting' ? WAITING_SLOT_POSITIONS[patient.slotIndex] :
          patient.location === 'recovery' && patient.slotIndex === 0 ? RECOVERY_POSITION :
            patient.location === 'healingMachine' ? HEALING_MACHINE_POSITION :
            patient.location === 'carrier' ? this.avatars.get(patient.carrierId)?.position : undefined;
      if (!position) continue;
      visible.add(patient.id);
      const presentation = patientPresentation(patient);
      const signature = `${patient.species}:${patient.location}:${patient.slotIndex}:${patient.carrierId}:${presentation.hp}:${presentation.status}`;
      const previous = this.patientMarkers.get(patient.id);
      if (previous?.signature === signature) continue;
      previous?.container.destroy();
      const carried = patient.location === 'carrier';
      const body = this.add.rectangle(0, carried ? 0 : -12, carried ? 40 : 28, carried ? 19 : 25,
        carried ? 0xe7e3d3 : 0xf6c76a).setStrokeStyle(2, 0x593a30);
      const label = this.add.text(0, patient.location === 'reception' ? 42 : carried ? -26 : 31,
        `${patient.species}  ${presentation.hp}/100`, {
        color: '#ffffff', backgroundColor: '#10243bcc', fontFamily: 'monospace', fontSize: '11px',
        padding: { x: 3, y: 2 },
      }).setOrigin(0.5);
      const container = this.add.container(position.x, position.y - (carried ? 28 : 0), [body, label])
        .setDepth(position.y + (carried ? 1 : 0));
      this.patientMarkers.set(patient.id, { container, signature });
    }
    for (const [id, marker] of this.patientMarkers) {
      if (visible.has(id)) continue;
      marker.container.destroy();
      this.patientMarkers.delete(id);
    }
    this.recoveryCount.setText(`QUEUE: ${this.patients.filter((patient) =>
      patient.lifecycle === 'active' && patient.location === 'recovery').length}`);
  }

  private refreshInteraction(): void {
    const local = this.authoritativePositions.get(this.localId);
    const targets: InteractionTarget[] = [];
    if (local) {
      for (let index = 0; index < RECEPTION_INTERACTION_POINTS.length; index += 1) {
        const occupant = this.patients.find((patient) => patient.lifecycle === 'active' &&
          patient.location === 'reception' && patient.slotIndex === index);
        targets.push({ id: `reception:${index}`, position: RECEPTION_INTERACTION_POINTS[index]!,
          expectedOccupantId: occupant?.id ?? '',
          label: local.carriedPatientId ? 'Cannot place at arrivals' :
            occupant ? `Pick up ${occupant.species}` : 'No patient' });
      }
      for (let index = 0; index < WAITING_INTERACTION_POINTS.length; index += 1) {
        const occupant = this.patients.find((patient) => patient.lifecycle === 'active' &&
          patient.location === 'waiting' && patient.slotIndex === index);
        targets.push({ id: `waiting:${index}`, position: WAITING_INTERACTION_POINTS[index]!,
          expectedOccupantId: occupant?.id ?? '',
          label: local.carriedPatientId ? occupant ? 'Slot occupied' : 'Place patient' :
            occupant ? `Pick up ${occupant.species}` : 'No patient' });
      }
      const front = this.patients.find((patient) => patient.lifecycle === 'active' &&
        patient.location === 'recovery' && patient.slotIndex === 0);
      targets.push({ id: 'recovery', position: RECOVERY_INTERACTION_POINT,
        expectedOccupantId: front?.id ?? '',
        label: local.carriedPatientId ? 'Recovery is pickup only' :
          front ? `Pick up ${front.species}` : 'Recovery empty' });
      const carried = this.patients.find((patient) => patient.id === local.carriedPatientId);
      const machinePatient = this.patients.find((patient) => patient.id === this.healingMachine.patientId);
      const machineLabel = local.carriedPatientId ? this.healingMachine.patientId ? 'Machine occupied' :
        carried && (carried.requiredTreatments & TREATMENT.healing) &&
          !(carried.completedTreatments & TREATMENT.healing) ? 'Place in healing machine' : 'Healing not needed' :
        this.healingMachine.status === 'completed' && machinePatient ? `Pick up ${machinePatient.species}` :
          this.healingMachine.status === 'treating' ? 'Treatment in progress' : 'Machine empty';
      targets.push({ id: 'healing:0', position: HEALING_INTERACTION_POINT,
        expectedOccupantId: this.healingMachine.patientId, label: machineLabel });
      targets.push({ id: 'discharge', position: DISCHARGE_INTERACTION_POINT,
        expectedOccupantId: carried?.id ?? '',
        label: carried ? patientPresentation(carried).readyForDischarge ? 'Discharge patient' :
          'Treatment still required' : 'No patient to discharge' });
    }
    const selected = local ? selectInteractionTarget(local, local.facing, targets) : null;
    if (this.selectedTarget?.id !== selected?.id) this.interactionFeedback = '';
    this.selectedTarget = selected;
    this.targetHighlight.setVisible(Boolean(selected));
    if (selected) this.targetHighlight.setPosition(selected.position.x, selected.position.y);
    this.interactionHint.setText(this.interactionFeedback || (selected ? `E: ${selected.label}` : ''));
  }

  private updateMachineText(): void {
    const machine = this.healingMachine;
    this.machineStatusText.setText(machine.status === 'treating' ?
      `${Math.ceil(machine.remainingMs / 1000)}s LEFT` :
      machine.status === 'completed' ? 'READY' : 'MACHINE EMPTY');
  }

  private drawMap(): void {
    const floor = this.add.graphics();
    floor.fillStyle(0x284656).fillRect(0, 0, 960, 540);
    floor.fillStyle(0x527e83).fillRect(48, 56, 864, 432);
    floor.fillStyle(0x7faeab).fillRect(58, 66, 844, 412);
    floor.lineStyle(1, 0x6b9c99, 0.55);
    for (let x = 58; x <= 902; x += TILE_SIZE) floor.lineBetween(x, 66, x, 478);
    for (let y = 66; y <= 478; y += TILE_SIZE) floor.lineBetween(58, y, 902, y);
    floor.fillStyle(0x2c5e67).fillRect(382, 478, 196, 10);

    this.add.text(26, 16, 'POKÉCENTER PANIC  /  PROTOTYPE MAP', {
      color: '#f8eac8', fontFamily: 'monospace', fontSize: '17px', fontStyle: 'bold',
    });
    this.add.text(26, 505, 'MOVE: WASD / ARROWS   •   FOUR DIRECTIONS   •   3 TILES / SECOND', {
      color: '#f8eac8', fontFamily: 'monospace', fontSize: '13px',
    });

    this.station(MAP_OBSTACLES[0]!, 0xd8a67e, 'RECEPTION  ·  4 SLOTS');
    for (let x = 177; x <= 753; x += 192) this.slot(x, 138, 1 + (x - 177) / 192);
    this.add.rectangle(DISCHARGE_POSITION.x, DISCHARGE_POSITION.y, 58, 24, 0x9bd59d)
      .setStrokeStyle(2, 0x426b4f);
    this.add.text(DISCHARGE_POSITION.x, DISCHARGE_POSITION.y, 'OUT', {
      color: '#173440', fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.station(MAP_OBSTACLES[1]!, 0x8abbd4, 'HEALING 01');
    this.station(MAP_OBSTACLES[2]!, 0x8abbd4, 'HEALING 02');
    this.station(MAP_OBSTACLES[3]!, 0xe3c58a, 'MEDICINE  ·  PREP × 2');
    this.station(MAP_OBSTACLES[4]!, 0xafa1c6, 'WAITING  ·  4 SLOTS');
    for (const [index, position] of WAITING_SLOT_POSITIONS.entries()) {
      this.slot(position.x, position.y, index + 1);
    }
    this.station(MAP_OBSTACLES[5]!, 0x9cbda2, 'RECOVERY / DISCHARGE');
    this.add.text(389, 333, 'MEDICINE SURFACES × 4', {
      color: '#234653', fontFamily: 'monospace', fontSize: '13px', fontStyle: 'bold',
    });
  }

  private station({ x, y, width, height }: MapObstacle, color: number, label: string): void {
    this.add.rectangle(x + width / 2, y + height / 2, width, height, color)
      .setStrokeStyle(3, 0x244653);
    this.add.text(x + 10, y + 9, label, {
      color: '#173440', fontFamily: 'monospace', fontSize: '13px', fontStyle: 'bold',
    });
  }

  private slot(x: number, y: number, number: number): void {
    this.add.rectangle(x, y, 42, 22, 0xf4d9b5).setStrokeStyle(2, 0x7e5948);
    this.add.text(x, y, String(number), {
      color: '#583e37', fontFamily: 'monospace', fontSize: '12px',
    }).setOrigin(0.5);
  }
}
