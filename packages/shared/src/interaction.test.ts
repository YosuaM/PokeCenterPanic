import { describe, expect, it } from 'vitest';
import { HEALING_INTERACTION_POINT, HEALING_MACHINE_BOUNDS,
  RECEPTION_INTERACTION_POINTS, WAITING_INTERACTION_POINTS } from './map.js';
import { isInteractionReachable, selectInteractionTarget } from './interaction.js';

// The left machine stands against the back and side walls, so staff reach it from the front or right.
const machine = HEALING_MACHINE_BOUNDS;
const centerX = 50;
const middleY = machine.y + machine.height / 2;
const front = machine.y + machine.height;
const right = machine.x + machine.width;

describe('interaction targeting', () => {
  it('requires a nearby target on a clear walkable path regardless of facing', () => {
    const reception = RECEPTION_INTERACTION_POINTS[0]!;
    expect(isInteractionReachable({ x: reception.x, y: reception.y + 20 }, 'up', reception)).toBe(true);
    expect(isInteractionReachable({ x: reception.x, y: reception.y + 20 }, 'down', reception)).toBe(true);
    expect(isInteractionReachable({ x: reception.x, y: reception.y + 86 }, 'up', reception)).toBe(false);
    const seat = WAITING_INTERACTION_POINTS[0]!;
    expect(isInteractionReachable({ x: seat.x, y: seat.y + 60 }, 'up', seat)).toBe(false);
  });

  it('selects the nearest valid target with stable ID tie breaking', () => {
    const [first, second] = WAITING_INTERACTION_POINTS;
    const targets = [
      { id: 'waiting:1', position: second!, expectedOccupantId: '', label: 'Place' },
      { id: 'waiting:0', position: first!, expectedOccupantId: '', label: 'Place' },
    ];
    const between = { x: (first!.x + second!.x) / 2, y: first!.y - 20 };
    expect(selectInteractionTarget(between, 'down', targets)?.id).toBe('waiting:0');
    expect(selectInteractionTarget(between, 'up', targets)?.id).toBe('waiting:0');
  });

  it.each([
    { x: centerX, y: front + 16 }, { x: centerX, y: front + 64 },
    { x: right + 40, y: middleY }, { x: right + 88, y: middleY },
    { x: right + 40, y: front + 16 }, { x: right + 64, y: front + 40 },
    { x: right + 40, y: machine.y + 16 }, { x: 0, y: front + 40 },
  ])('reaches the machine from adjacent position %j regardless of facing', (position) => {
    for (const facing of ['up', 'down', 'left', 'right'] as const) {
      expect(isInteractionReachable(position, facing, HEALING_MACHINE_BOUNDS)).toBe(true);
    }
  });

  it.each([
    [{ x: centerX, y: front + 64 }, { x: centerX, y: front + 64.01 }],
    [{ x: right + 88, y: middleY }, { x: right + 88.01, y: middleY }],
  ])('limits machine reach to one tile at boundary %j', (boundary, outside) => {
    expect(isInteractionReachable(boundary!, 'up', HEALING_MACHINE_BOUNDS)).toBe(true);
    expect(isInteractionReachable(outside!, 'up', HEALING_MACHINE_BOUNDS)).toBe(false);
  });

  it.each([
    { x: centerX, y: middleY }, { x: right + 39, y: middleY }, { x: centerX, y: front + 15 },
    { x: centerX, y: front + 120 }, { x: 480, y: 450 },
    { x: NaN, y: middleY }, { x: centerX, y: Infinity }, { x: -200, y: middleY },
  ])('rejects blocked, distant, or invalid machine approach %j', (position) => {
    expect(isInteractionReachable(position, 'up', HEALING_MACHINE_BOUNDS)).toBe(false);
  });

  it('rejects a station perimeter obstructed by other solid geometry', () => {
    expect(isInteractionReachable({ x: 0, y: 220 }, 'down',
      { x: 0, y: 264, width: 48, height: 48 })).toBe(false);
  });

  it('highlights the nearest machine perimeter and compares actual approach distances', () => {
    const target = { id: 'healing:0', position: HEALING_INTERACTION_POINT,
      bounds: HEALING_MACHINE_BOUNDS, expectedOccupantId: '', label: 'Machine empty' };
    const player = { x: centerX, y: front + 40 };
    const point = { id: 'other', position: { x: centerX, y: front + 80 },
      expectedOccupantId: '', label: 'Other station' };
    expect(selectInteractionTarget(player, 'up', [point, target])).toMatchObject({
      id: 'healing:0', position: { x: centerX, y: front + 16 }, label: 'Machine empty',
    });
    expect(target.position).toEqual(HEALING_INTERACTION_POINT);
    expect(selectInteractionTarget(player, 'up', [target, { ...point, position: { x: centerX, y: front + 50 } }])?.id)
      .toBe('other');
    const tied = { ...target, id: 'healing:1' };
    expect(selectInteractionTarget(player, 'up', [tied, target])?.id).toBe('healing:0');
    expect(selectInteractionTarget(player, 'up', [target, tied])?.id).toBe('healing:0');
  });
});
