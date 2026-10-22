import { describe, expect, it } from 'vitest';
import { ContextualHints, HINT_TEXT, hintActionFor } from './contextualHints.js';

describe('contextual hints', () => {
  it.each([
    ['waiting:2', 'Pick up Eevee', 'pickup'],
    ['recovery', 'Pick up Psyduck', 'pickup'],
    ['healing:1', 'Pick up Pikachu', 'pickup'],
    ['waiting:0', 'Place patient', 'seat'],
    ['healing:0', 'Place in healing machine', 'heal'],
    ['medicine:prep:1', 'Hold E: prepare Antidote', 'prepare'],
    ['medicine:apply:waiting:3', 'Apply Burn Heal to Charmander', 'medicate'],
    ['discharge', 'Discharge patient', 'discharge'],
    ['healing:1', 'Hold E: repair outage', 'repair'],
  ])('classifies %s "%s" as %s', (targetId, label, action) => {
    expect(hintActionFor(targetId, label)).toBe(action);
  });

  it.each([
    ['discharge', 'Treatment still required'],
    ['healing:0', 'Healing not needed'],
    ['waiting:1', 'Slot occupied'],
    ['medicine:prep:0', 'Preparation occupied'],
    ['medicine:apply:waiting:0', 'Medicine does not match'],
    ['medicine:surface:0', 'Pick up Burn Heal'],
    ['healing:0', 'Hold E: repairing outage'],
  ])('offers no tip for %s "%s"', (targetId, label) => {
    expect(hintActionFor(targetId, label)).toBeNull();
  });

  it('shows each tip until its action is used, independently of other tips', () => {
    const hints = new ContextualHints();
    expect(hints.text(null)).toBe('');
    expect(hints.text('pickup')).toBe(HINT_TEXT.pickup);
    hints.markUsed('pickup');
    hints.markUsed('pickup');
    hints.markUsed(null);
    expect(hints.text('pickup')).toBe('');
    expect(hints.text('discharge')).toBe(HINT_TEXT.discharge);
  });

  it('keeps every tip on one short HUD line', () => {
    for (const text of Object.values(HINT_TEXT)) expect(text.length).toBeLessThanOrEqual(68);
  });
});
