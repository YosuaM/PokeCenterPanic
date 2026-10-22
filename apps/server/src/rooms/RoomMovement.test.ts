import { describe, expect, it } from 'vitest';
import { HEALING_INTERACTION_POINT, MAP_OBSTACLES, isWalkable, PLAYER_HALF_WIDTH } from '@pokecenter/shared';
import { RoomMovement } from './RoomMovement.js';

describe('RoomMovement', () => {
  it('stops round input and resets spawns without reviving reservations or accepting old sequences', () => {
    const movement = new RoomMovement();
    const spawn = { ...movement.add('red').position };
    movement.add('blue');
    movement.accept('red', { direction: 'right', sequence: 4, roundId: 'first' }, 0, 'first');
    movement.advance(50, 50);
    const moved = { ...movement.position('red')! };
    movement.stopAll();
    movement.advance(50, 100);
    expect(movement.position('red')).toEqual(moved);
    movement.suspend('blue');
    movement.resetRound();
    expect(movement.position('red')).toEqual(spawn);
    expect(movement.facing('red')).toBe('up');
    expect(movement.position('blue')).toBeUndefined();
    expect(movement.accept('red', { direction: 'left', sequence: 4, roundId: 'second' }, 200, 'second')).toBe(false);
    expect(movement.accept('red', { direction: 'left', sequence: 5, roundId: 'first' }, 200, 'second')).toBe(false);
    expect(movement.accept('red', { direction: 'left', sequence: 5, roundId: 'second' }, 200, 'second')).toBe(true);
  });

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

  it('keeps a server-authoritative player outside a machine after approaching its side', () => {
    const movement = new RoomMovement();
    movement.add('red');
    let sequence = 0;
    let now = 0;
    const advance = (direction: 'up' | 'left', ticks: number): void => {
      for (let tick = 0; tick < ticks; tick += 1) {
        now += 100;
        sequence += 1;
        expect(movement.accept('red', { direction, sequence, roundId: null }, now)).toBe(true);
        movement.advance(100, now);
        expect(isWalkable(movement.position('red')!)).toBe(true);
      }
    };
    Object.assign(movement.position('red')!, { x: HEALING_INTERACTION_POINT.x + 40,
      y: HEALING_INTERACTION_POINT.y });
    advance('left', 10);
    const position = movement.position('red')!;
    const machine = MAP_OBSTACLES[1]!;
    expect(position.y).toBe(HEALING_INTERACTION_POINT.y);
    expect(position.x).toBeCloseTo(machine.x + machine.width + PLAYER_HALF_WIDTH, 1);
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
