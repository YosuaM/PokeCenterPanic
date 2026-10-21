import { describe, expect, it } from 'vitest';
import { MovementInput } from './movement.js';

const bounds = { left: 0, right: 100, top: 0, bottom: 100 };

describe('MovementInput', () => {
  it('moves at three tile widths per second along one cardinal direction', () => {
    const input = new MovementInput();
    input.press('KeyD');
    expect(input.move({ x: 50, y: 50 }, 100, 144, bounds)).toEqual({ x: 64.4, y: 50 });
    input.release('KeyD');
    expect(input.move({ x: 64.4, y: 50 }, 100, 144, bounds)).toEqual({ x: 64.4, y: 50 });
  });

  it('uses the most recently pressed direction and falls back on release', () => {
    const input = new MovementInput();
    input.press('KeyW');
    input.press('ArrowRight');
    input.press('ArrowRight');
    expect(input.direction).toBe('right');
    expect(input.move({ x: 50, y: 50 }, 100, 100, bounds)).toEqual({ x: 60, y: 50 });
    input.release('ArrowRight');
    expect(input.direction).toBe('up');
    input.clear();
    expect(input.direction).toBeNull();
  });

  it('ignores unrelated keys, clamps map edges, and limits a delayed frame', () => {
    const input = new MovementInput();
    expect(input.press('Space')).toBe(false);
    input.press('ArrowLeft');
    expect(input.move({ x: 2, y: 50 }, 3000, 144, bounds)).toEqual({ x: 0, y: 50 });
    input.press('KeyS');
    expect(input.move({ x: 50, y: 98 }, 100, 144, bounds)).toEqual({ x: 50, y: 100 });
    expect(input.move({ x: 50, y: 50 }, -100, 144, bounds)).toEqual({ x: 50, y: 50 });
  });
});
