import { describe, expect, it } from 'vitest';
import { RoomMovement } from './RoomMovement.js';

describe('RoomMovement', () => {
  it('ignores input from another round', () => {
    const movement = new RoomMovement();
    movement.add('red');
    expect(movement.accept('red', { direction: 'right', sequence: 1, roundId: 'old' },
      0, 'current')).toBe(false);
    expect(movement.accept('red', { direction: 'right', sequence: 1, roundId: 'current' },
      0, 'current')).toBe(true);
  });
  it('accepts only sequenced cardinal input from an existing player', () => {
    const movement = new RoomMovement();
    movement.add('red');
    expect(movement.accept('unknown', { direction: 'right', sequence: 1, roundId: null }, 0)).toBe(false);
    expect(movement.accept('red', { x: 800, y: 400, direction: 'right', sequence: 1 }, 0)).toBe(false);
    expect(movement.accept('red', { direction: 'diagonal', sequence: 1, roundId: null }, 0)).toBe(false);
    expect(movement.accept('red', { direction: 'right', sequence: 1.5, roundId: null }, 0)).toBe(false);
    expect(movement.accept('red', { direction: 'right', sequence: 1, roundId: null }, 0)).toBe(true);
    expect(movement.facing('red')).toBe('right');
    movement.advance(50, 50);
    expect(movement.position('red')).toEqual({ x: 463.2, y: 422 });
  });

  it('ignores repeated or stale commands and stops movement after input timeout', () => {
    const movement = new RoomMovement();
    movement.add('red');
    movement.accept('red', { direction: 'right', sequence: 2, roundId: null }, 0);
    expect(movement.accept('red', { direction: 'left', sequence: 2, roundId: null }, 200)).toBe(false);
    expect(movement.accept('red', { direction: 'left', sequence: 1, roundId: null }, 200)).toBe(false);
    expect(movement.facing('red')).toBe('right');
    movement.advance(50, 250);
    expect(movement.position('red')).toEqual({ x: 456, y: 422 });
    movement.accept('red', { direction: null, sequence: 3, roundId: null }, 260);
    expect(movement.facing('red')).toBe('right');
  });

  it('blocks stations and edges but lets players pass through each other', () => {
    const movement = new RoomMovement();
    movement.add('red');
    movement.add('blue');
    movement.accept('red', { direction: 'right', sequence: 1, roundId: null }, 0);
    movement.accept('blue', { direction: 'left', sequence: 1, roundId: null }, 0);
    movement.advance(100, 100);
    movement.advance(100, 200);
    expect(movement.position('red')!.x).toBeGreaterThan(movement.position('blue')!.x);

    movement.accept('red', { direction: 'up', sequence: 2, roundId: null }, 200);
    for (let tick = 1; tick <= 15; tick += 1) {
      movement.accept('red', { direction: 'up', sequence: 2 + tick, roundId: null }, 200 + tick * 50);
      movement.advance(50, 200 + tick * 50);
    }
    expect(movement.position('red')!.y).toBeGreaterThanOrEqual(322);
    movement.remove('red');
    expect(movement.position('red')).toBeUndefined();
    expect(movement.accept('red', { direction: 'up', sequence: 30, roundId: null }, 1000)).toBe(false);
  });

  it('reuses a vacated spawn without overlapping an occupied slot', () => {
    const movement = new RoomMovement();
    expect(movement.add('red').slot).toBe(0);
    expect(movement.add('blue').slot).toBe(1);
    movement.remove('red');
    expect(movement.add('green').slot).toBe(0);
  });

  it('reserves the original slot, stops dropped input, and resumes empty-handed at the entry point', () => {
    const movement = new RoomMovement();
    expect(movement.add('red').slot).toBe(0);
    movement.accept('red', { direction: 'right', sequence: 4, roundId: null }, 0);
    movement.advance(50, 50);
    movement.suspend('red');
    expect(movement.position('red')).toBeUndefined();
    expect(movement.accept('red', { direction: 'left', sequence: 5, roundId: null }, 60)).toBe(false);
    expect(movement.add('blue').slot).toBe(1);
    expect(movement.resume('red')).toEqual({ x: 456, y: 422 });
    expect(movement.lastSequence('red')).toBe(4);
    expect(movement.accept('red', { direction: 'left', sequence: 4, roundId: null }, 70)).toBe(false);
    expect(movement.accept('red', { direction: 'left', sequence: 5, roundId: null }, 70)).toBe(true);
  });
});
