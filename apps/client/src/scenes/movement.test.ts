import { describe, expect, it } from 'vitest';
import { MovementInput } from './movement.js';

describe('MovementInput', () => {
  it('selects the most recently pressed cardinal direction without diagonals', () => {
    const input = new MovementInput();
    expect(input.press('KeyW')).toBe(true);
    expect(input.press('ArrowRight')).toBe(true);
    input.press('ArrowRight');
    expect(input.direction).toBe('right');
    input.release('ArrowRight');
    expect(input.direction).toBe('up');
  });

  it('ignores unrelated keys and clears held movement on focus loss', () => {
    const input = new MovementInput();
    expect(input.press('Space')).toBe(false);
    expect(input.direction).toBeNull();
    input.press('ArrowLeft');
    input.clear();
    expect(input.direction).toBeNull();
  });
});
