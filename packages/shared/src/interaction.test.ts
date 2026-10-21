import { describe, expect, it } from 'vitest';
import { RECEPTION_INTERACTION_POINTS, WAITING_INTERACTION_POINTS } from './map.js';
import { isInteractionReachable, selectInteractionTarget } from './interaction.js';

describe('interaction targeting', () => {
  it('requires a nearby target in front on a clear walkable path', () => {
    expect(isInteractionReachable({ x: 177, y: 354 }, 'up', RECEPTION_INTERACTION_POINTS[0]!)).toBe(true);
    expect(isInteractionReachable({ x: 177, y: 354 }, 'down', RECEPTION_INTERACTION_POINTS[0]!)).toBe(false);
    expect(isInteractionReachable({ x: 177, y: 420 }, 'up', RECEPTION_INTERACTION_POINTS[0]!)).toBe(false);
    expect(isInteractionReachable({ x: 130, y: 565 }, 'up', WAITING_INTERACTION_POINTS[0]!)).toBe(false);
  });

  it('selects the nearest valid target with stable ID tie breaking', () => {
    const targets = [
      { id: 'waiting:1', position: { x: 184, y: 545 }, expectedOccupantId: '', label: 'Place' },
      { id: 'waiting:0', position: { x: 130, y: 545 }, expectedOccupantId: '', label: 'Place' },
    ];
    expect(selectInteractionTarget({ x: 157, y: 530 }, 'down', targets)?.id).toBe('waiting:0');
    expect(selectInteractionTarget({ x: 157, y: 530 }, 'up', targets)).toBeNull();
  });
});
