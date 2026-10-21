import type { Direction } from '@pokecenter/shared';

const DIRECTIONS: Record<string, Direction> = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
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

}
