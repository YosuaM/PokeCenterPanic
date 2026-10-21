import Phaser from 'phaser';
import { MAP_OBSTACLES, RECEPTION_SLOT_POSITIONS, SPAWN_POINTS, TILE_SIZE, patientPresentation,
  type Direction, type MapObstacle, type PatientRecord, type PlayerPosition, type PlayerPresence, type Point } from '@pokecenter/shared';
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
  private readonly authoritativePositions = new Map<string, Point>();
  private players: PlayerPresence[] = [];
  private patients: PatientRecord[] = [];
  private localId = '';
  private inputSender: ((direction: Direction | null) => void) | null = null;
  private lastSentAt = -Infinity;
  private lastSentDirection: Direction | null = null;

  constructor() {
    super('map');
  }

  create(): void {
    this.drawMap();
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
    if (this.sys.isActive()) this.renderPlayers();
  }

  clearPlayers(): void {
    this.setPlayers([], '');
    this.setPatients([]);
    this.inputSender = null;
  }

  setPatients(patients: PatientRecord[]): void {
    this.patients = patients;
    if (this.sys.isActive()) this.renderPatients();
  }

  setInputSender(sender: (direction: Direction | null) => void): void {
    this.inputSender = sender;
  }

  setAuthoritativePositions(positions: PlayerPosition[]): void {
    for (const { id, x, y } of positions) {
      this.authoritativePositions.set(id, { x, y });
      const avatar = this.avatars.get(id);
      if (avatar) avatar.target = { x, y };
    }
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
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.avatars.has(this.localId) || this.isTyping()) return;
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
      if (patient.lifecycle !== 'active' || patient.location !== 'reception') continue;
      const position = RECEPTION_SLOT_POSITIONS[patient.slotIndex];
      if (!position) continue;
      visible.add(patient.id);
      const presentation = patientPresentation(patient);
      const signature = `${patient.species}:${patient.slotIndex}:${presentation.hp}:${presentation.status}`;
      const previous = this.patientMarkers.get(patient.id);
      if (previous?.signature === signature) continue;
      previous?.container.destroy();
      const body = this.add.rectangle(0, -12, 28, 25, 0xf6c76a).setStrokeStyle(2, 0x593a30);
      const label = this.add.text(0, 42, `${patient.species}  ${presentation.hp}/100`, {
        color: '#ffffff', backgroundColor: '#10243bcc', fontFamily: 'monospace', fontSize: '11px',
        padding: { x: 3, y: 2 },
      }).setOrigin(0.5);
      const container = this.add.container(position.x, position.y, [body, label]).setDepth(position.y);
      this.patientMarkers.set(patient.id, { container, signature });
    }
    for (const [id, marker] of this.patientMarkers) {
      if (visible.has(id)) continue;
      marker.container.destroy();
      this.patientMarkers.delete(id);
    }
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

    this.station(MAP_OBSTACLES[1]!, 0x8abbd4, 'HEALING 01');
    this.station(MAP_OBSTACLES[2]!, 0x8abbd4, 'HEALING 02');
    this.station(MAP_OBSTACLES[3]!, 0xe3c58a, 'MEDICINE  ·  PREP × 2');
    this.station(MAP_OBSTACLES[4]!, 0xafa1c6, 'WAITING  ·  4 SLOTS');
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
