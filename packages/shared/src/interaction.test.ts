import { describe, expect, it } from 'vitest';
import { HEALING_INTERACTION_POINT, HEALING_MACHINE_BOUNDS,
  RECEPTION_INTERACTION_POINTS, WAITING_INTERACTION_POINTS } from './map.js';
import { isInteractionReachable, selectInteractionTarget } from './interaction.js';

describe('interaction targeting', () => {
  it('requires a nearby target on a clear walkable path regardless of facing', () => {
    expect(isInteractionReachable({ x: 177, y: 354 }, 'up', RECEPTION_INTERACTION_POINTS[0]!)).toBe(true);
    expect(isInteractionReachable({ x: 177, y: 354 }, 'down', RECEPTION_INTERACTION_POINTS[0]!)).toBe(true);
    expect(isInteractionReachable({ x: 177, y: 420 }, 'up', RECEPTION_INTERACTION_POINTS[0]!)).toBe(false);
    expect(isInteractionReachable({ x: 130, y: 565 }, 'up', WAITING_INTERACTION_POINTS[0]!)).toBe(false);
  });

  it('selects the nearest valid target with stable ID tie breaking', () => {
    const targets = [
      { id: 'waiting:1', position: { x: 184, y: 545 }, expectedOccupantId: '', label: 'Place' },
      { id: 'waiting:0', position: { x: 130, y: 545 }, expectedOccupantId: '', label: 'Place' },
    ];
    expect(selectInteractionTarget({ x: 157, y: 530 }, 'down', targets)?.id).toBe('waiting:0');
    expect(selectInteractionTarget({ x: 157, y: 530 }, 'up', targets)?.id).toBe('waiting:0');
  });

  it.each([
    { x: 40, y: -66 }, { x: 40, y: 131 },
    { x: -102, y: 33 }, { x: 181, y: 33 },
    { x: -102, y: -66 }, { x: 181, y: -66 },
    { x: -102, y: 131 }, { x: 181, y: 131 },
    { x: 40, y: -42 }, { x: 40, y: 107 },
    { x: -78, y: 33 }, { x: 157, y: 33 },
  ])('reaches the machine from adjacent position %j regardless of facing', (position) => {
    for (const facing of ['up', 'down', 'left', 'right'] as const) {
      expect(isInteractionReachable(position, facing, HEALING_MACHINE_BOUNDS)).toBe(true);
    }
  });

  it.each([
    [{ x: 40, y: -90 }, { x: 40, y: -90.01 }],
    [{ x: 40, y: 155 }, { x: 40, y: 155.01 }],
    [{ x: -126, y: 33 }, { x: -126.01, y: 33 }],
    [{ x: 205, y: 33 }, { x: 205.01, y: 33 }],
  ])('limits machine reach to one tile at boundary %j', (boundary, outside) => {
    expect(isInteractionReachable(boundary!, 'up', HEALING_MACHINE_BOUNDS)).toBe(true);
    expect(isInteractionReachable(outside!, 'up', HEALING_MACHINE_BOUNDS)).toBe(false);
  });

  it.each([
    { x: 40, y: 33 }, { x: 156, y: 33 }, { x: 40, y: 106 },
    { x: 196, y: 146 }, { x: 456, y: 422 },
    { x: NaN, y: 33 }, { x: 40, y: Infinity }, { x: -200, y: 33 },
  ])('rejects blocked, distant, or invalid machine approach %j', (position) => {
    expect(isInteractionReachable(position, 'up', HEALING_MACHINE_BOUNDS)).toBe(false);
  });

  it('rejects a station perimeter obstructed by other solid geometry', () => {
    expect(isInteractionReachable({ x: 0, y: 220 }, 'down',
      { x: 0, y: 264, width: 48, height: 48 })).toBe(false);
  });

  it('highlights the nearest machine perimeter and compares actual approach distances', () => {
    const machine = { id: 'healing:0', position: HEALING_INTERACTION_POINT,
      bounds: HEALING_MACHINE_BOUNDS, expectedOccupantId: '', label: 'Machine empty' };
    const player = { x: 40, y: -66 };
    const point = { id: 'other', position: { x: 40, y: -106 },
      expectedOccupantId: '', label: 'Other station' };
    expect(selectInteractionTarget(player, 'up', [point, machine])).toMatchObject({
      id: 'healing:0', position: { x: 40, y: -42 }, label: 'Machine empty',
    });
    expect(machine.position).toEqual(HEALING_INTERACTION_POINT);
    expect(selectInteractionTarget(player, 'up', [machine, { ...point, position: { x: 40, y: -76 } }])?.id)
      .toBe('other');
    const tied = { ...machine, id: 'healing:1' };
    expect(selectInteractionTarget(player, 'up', [tied, machine])?.id).toBe('healing:0');
    expect(selectInteractionTarget(player, 'up', [machine, tied])?.id).toBe('healing:0');
  });
});
