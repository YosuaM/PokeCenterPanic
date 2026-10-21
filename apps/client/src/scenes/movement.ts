export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

const DIRECTIONS: Record<string, Direction> = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

const VECTORS: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export class MovementInput {
  private readonly held = new Map<string, Direction>();

  press(code: string): boolean {
    const direction = DIRECTIONS[code];
    if (!direction) return false;
    if (!this.held.has(code)) this.held.set(code, direction);
    return true;
  }

  release(code: string): void {
    this.held.delete(code);
  }

  clear(): void {
    this.held.clear();
  }

  get direction(): Direction | null {
    return [...this.held.values()].at(-1) ?? null;
  }

  move(position: Point, elapsedMs: number, speed: number, bounds: Bounds): Point {
    const direction = this.direction;
    if (!direction) return position;
    const distance = speed * Math.min(Math.max(elapsedMs, 0), 100) / 1000;
    const vector = VECTORS[direction];
    return {
      x: Math.min(bounds.right, Math.max(bounds.left, position.x + vector.x * distance)),
      y: Math.min(bounds.bottom, Math.max(bounds.top, position.y + vector.y * distance)),
    };
  }
}
