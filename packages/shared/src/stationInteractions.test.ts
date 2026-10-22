import { describe, expect, it } from 'vitest';
import { isInteractionReachable, selectInteractionTarget } from './interaction.js';
import { stationInteractionBounds } from './stationInteractions.js';
import { DISCHARGE_INTERACTION_POINT, RECOVERY_INTERACTION_POINT, RECEPTION_INTERACTION_POINTS,
  WAITING_INTERACTION_POINTS, type Point } from './map.js';
import { MEDICINE_DISPOSAL_POINT, MEDICINE_PREPARATION_POINTS, MEDICINE_SURFACE_POINTS } from './medicine.js';

const approaches = [
  { id: 'reception:0', position: { x: 348, y: 334 } },
  { id: 'reception:0', position: { x: 348, y: 234 } },
  { id: 'reception:1', position: { x: 412, y: 234 } },
  { id: 'reception:2', position: { x: 548, y: 234 } },
  { id: 'reception:3', position: { x: 612, y: 334 } },
  { id: 'discharge', position: { x: 480, y: 334 } },
  { id: 'discharge', position: { x: 480, y: 234 } },
  { id: 'discharge', position: { x: 480, y: 380 } },
  { id: 'waiting:0', position: { x: 20, y: 492 } },
  { id: 'waiting:3', position: { x: 182, y: 492 } },
  { id: 'waiting:3', position: { x: 252, y: 527 } },
  { id: 'waiting:4', position: { x: 796, y: 492 } },
  { id: 'waiting:4', position: { x: 708, y: 527 } },
  { id: 'waiting:7', position: { x: 958, y: 492 } },
  { id: 'recovery', position: { x: 888, y: 342 } },
  { id: 'recovery', position: { x: 888, y: 234 } },
  { id: 'recovery', position: { x: 728, y: 288 } },
  { id: 'medicine:prep:0', position: { x: 400, y: 58 } },
  { id: 'medicine:prep:0', position: { x: 400, y: 106 } },
  { id: 'medicine:prep:0', position: { x: 302, y: 0 } },
  { id: 'medicine:prep:1', position: { x: 560, y: 58 } },
  { id: 'medicine:prep:1', position: { x: 658, y: 0 } },
  { id: 'medicine:disposal', position: { x: 480, y: 58 } },
  { id: 'medicine:disposal', position: { x: 480, y: 106 } },
];

describe('station adjacency', () => {
  it.each(approaches)('reaches $id from $position regardless of facing', ({ id, position }) => {
    const bounds = stationInteractionBounds(id);
    expect(bounds).toBeDefined();
    for (const facing of ['up', 'down', 'left', 'right'] as const) {
      expect(isInteractionReachable(position, facing, bounds!)).toBe(true);
    }
  });

  it.each(WAITING_INTERACTION_POINTS.map((point, index) => ({ point, index })))(
    'selects waiting seat $index independently from the front and back', ({ point, index }) => {
      const targets = WAITING_INTERACTION_POINTS.map((position, slot) => ({ id: `waiting:${slot}`,
        position, bounds: stationInteractionBounds(`waiting:${slot}`), expectedOccupantId: '', label: 'Seat' }));
      for (const y of [point.y, point.y - 12]) {
        expect(selectInteractionTarget({ x: point.x, y }, 'left', targets)?.id).toBe(`waiting:${index}`);
      }
    });

  it('keeps reception and discharge independently selectable from the front', () => {
    const targets = [...RECEPTION_INTERACTION_POINTS.map((position, index) => ({ id: `reception:${index}`, position })),
      { id: 'discharge', position: DISCHARGE_INTERACTION_POINT }].map((target) => ({ ...target,
        bounds: stationInteractionBounds(target.id), expectedOccupantId: '', label: 'Counter' }));
    for (const target of targets) {
      for (const y of [340, 228]) {
        expect(selectInteractionTarget({ x: target.position.x, y }, 'right', targets)?.id).toBe(target.id);
      }
    }
  });

  it.each(['reception:0', 'reception:3', 'waiting:0', 'waiting:7', 'recovery', 'healing:0', 'healing:1'])(
    'uses the same region for pickup and medicine at %s', (id) => {
      expect(stationInteractionBounds(`medicine:apply:${id}`)).toEqual(stationInteractionBounds(id));
    });

  it.each(MEDICINE_SURFACE_POINTS)('reaches a free-standing medicine marker %j from every adjacent direction', (point) => {
    for (const [dx, dy] of [[-24, 0], [24, 0], [0, -24], [0, 24]]) {
      for (const facing of ['up', 'down', 'left', 'right'] as const) {
        expect(isInteractionReachable({ x: point.x + dx!, y: point.y + dy! }, facing, point)).toBe(true);
      }
    }
  });

  it.each([
    { id: 'reception:0', position: { x: 348, y: 290 } },
    { id: 'waiting:0', position: { x: 20, y: 552 } },
    { id: 'waiting:0', position: { x: 20, y: 420 } },
    { id: 'recovery', position: { x: 888, y: 288 } },
    { id: 'recovery', position: { x: 888, y: 420 } },
    { id: 'medicine:prep:0', position: { x: 400, y: 0 } },
    { id: 'medicine:prep:0', position: { x: 400, y: -100 } },
  ])('rejects blocked or distant access to $id at $position', ({ id, position }) => {
    expect(isInteractionReachable(position, 'down', stationInteractionBounds(id)!)).toBe(false);
  });

  it.each(['reception:4', 'waiting:8', 'waiting:-1', 'waiting:00', 'medicine:prep:2', 'healing:2', 'unknown'])(
    'does not invent a station region for %s', (id) => {
      expect(stationInteractionBounds(id)).toBeUndefined();
    });

  it('keeps markers and non-overlapping regions available without filtering invalid actions', () => {
    const points: Array<{ id: string; position: Point }> = [
      ...MEDICINE_PREPARATION_POINTS.map((position, index) => ({ id: `medicine:prep:${index}`, position })),
      ...MEDICINE_SURFACE_POINTS.map((position, index) => ({ id: `medicine:surface:${index}`, position })),
      { id: 'medicine:disposal', position: MEDICINE_DISPOSAL_POINT },
      { id: 'recovery', position: RECOVERY_INTERACTION_POINT },
    ];
    const targets = points.map((target) => ({ ...target, bounds: stationInteractionBounds(target.id),
      expectedOccupantId: '', label: 'Unavailable' }));
    expect(selectInteractionTarget({ x: 400, y: 70 }, 'down', targets)?.id).toBe('medicine:prep:0');
    expect(selectInteractionTarget({ x: 400, y: 118 }, 'up', targets)?.id).toBe('medicine:surface:0');
  });
});
