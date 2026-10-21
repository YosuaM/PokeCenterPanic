import Phaser from 'phaser';
import type { PlayerPresence } from '@pokecenter/shared';
import { MovementInput, type Point } from './movement.js';

const TILE_SIZE = 48;
const SPEED = TILE_SIZE * 3;
const WALK_BOUNDS = { left: 70, right: 890, top: 78, bottom: 468 };
const SPAWNS: Point[] = [
  { x: 456, y: 422 }, { x: 504, y: 422 },
  { x: 408, y: 422 }, { x: 552, y: 422 },
];
const PLAYER_COLORS = [0x4cc9c0, 0xf29c75, 0xb2a0f7, 0xf5ce69];

interface Avatar {
  container: Phaser.GameObjects.Container;
  position: Point;
  slot: number;
}

export class MapScene extends Phaser.Scene {
  private readonly movement = new MovementInput();
  private readonly avatars = new Map<string, Avatar>();
  private players: PlayerPresence[] = [];
  private localId = '';

  constructor() {
    super('map');
  }

  create(): void {
    this.drawMap();
    this.renderPlayers();
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
    this.players = players;
    this.localId = localId;
    this.movement.clear();
    if (this.sys.isActive()) this.renderPlayers();
  }

  clearPlayers(): void {
    this.setPlayers([], '');
  }

  update(_time: number, delta: number): void {
    const avatar = this.avatars.get(this.localId);
    if (!avatar) return;
    avatar.position = this.movement.move(avatar.position, delta, SPEED, WALK_BOUNDS);
    avatar.container.setPosition(avatar.position.x, avatar.position.y);
    avatar.container.setDepth(avatar.position.y);
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
  };

  private readonly onFocusIn = (): void => {
    if (this.isTyping()) this.movement.clear();
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
      }
    }
    this.players.forEach((player) => {
      if (this.avatars.has(player.id)) return;
      const usedSlots = new Set([...this.avatars.values()].map((avatar) => avatar.slot));
      const slot = SPAWNS.findIndex((_, index) => !usedSlots.has(index));
      if (slot < 0) return;
      const position = { ...SPAWNS[slot]! };
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
      this.avatars.set(player.id, { container, position, slot });
    });
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

    this.station(82, 88, 796, 68, 0xd8a67e, 'RECEPTION  ·  4 SLOTS');
    for (let x = 177; x <= 753; x += 192) this.slot(x, 138, 1 + (x - 177) / 192);

    this.station(82, 214, 155, 117, 0x8abbd4, 'HEALING 01');
    this.station(723, 214, 155, 117, 0x8abbd4, 'HEALING 02');
    this.station(342, 204, 276, 102, 0xe3c58a, 'MEDICINE  ·  PREP × 2');
    this.station(82, 359, 240, 76, 0xafa1c6, 'WAITING  ·  4 SLOTS');
    this.station(638, 359, 240, 76, 0x9cbda2, 'RECOVERY / DISCHARGE');
    this.add.text(389, 333, 'MEDICINE SURFACES × 4', {
      color: '#234653', fontFamily: 'monospace', fontSize: '13px', fontStyle: 'bold',
    });
  }

  private station(x: number, y: number, width: number, height: number, color: number, label: string): void {
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
