import { describe, expect, it } from 'vitest';
import type { HealingMachineSnapshot, PatientRecord } from '@pokecenter/shared';
import { FEED_ENTRY_MS, HudFeed, SCORE_POPUP_MS } from './hudFeed.js';
import { IDLE_ACTION, type HudState } from './hudState.js';

const empty: HealingMachineSnapshot = { patientId: '', status: 'empty', remainingMs: 0 };
const broken: HealingMachineSnapshot = { ...empty, status: 'broken' };

function patient(id: string, lifecycle: PatientRecord['lifecycle'], species: PatientRecord['species'] = 'Pikachu'): PatientRecord {
  return { id, species, requiredTreatments: 1, completedTreatments: 1, initialPatienceMs: 90_000,
    remainingPatienceMs: 0, lifecycle, location: 'none', slotIndex: -1, carrierId: '' };
}

function state(overrides: Partial<HudState> = {}): HudState {
  return { active: true, localId: 'red', players: [], positions: [], patients: [], machines: [empty, empty], doses: [],
    medicineOwners: ['', ''], medicineRemainingMs: [0, 0], remainingMs: 300_000, score: 0, streak: 0, discharged: 0,
    lost: 0, focusedPatientId: '', action: IDLE_ACTION, tip: '', notice: '', manifest: null, ...overrides };
}

describe('HUD event feed', () => {
  it('starts from the first snapshot without replaying existing state', () => {
    const feed = new HudFeed();
    feed.sync(state({ machines: [broken, empty], discharged: 4, score: 300, notice: 'Eevee is ready for discharge' }), 0);
    expect(feed.entries(0)).toEqual([]);
    expect(feed.popups(0)).toEqual([]);
  });

  it('announces outages, repairs, discharges, losses and ready notices once each', () => {
    const feed = new HudFeed();
    feed.sync(state({ patients: [patient('a', 'active')] }), 0);
    feed.sync(state({ machines: [empty, broken] }), 100);
    feed.sync(state({ machines: [empty, broken] }), 150);
    feed.sync(state({ machines: [empty, empty], discharged: 1, patients: [patient('a', 'discharged', 'Squirtle')] }), 200);
    feed.sync(state({ discharged: 1, lost: 1, patients: [patient('a', 'discharged'), patient('b', 'lost', 'Eevee')] }), 300);
    expect(feed.entries(300).map((entry) => [entry.text, entry.tone])).toEqual([
      ['Right machine is back online', 'good'], ['Squirtle discharged', 'good'], ['Eevee gave up waiting', 'alert']]);
    feed.sync(state({ discharged: 1, lost: 1, notice: 'Pikachu #1 is ready for discharge' }), 400);
    feed.sync(state({ discharged: 1, lost: 1, notice: 'Pikachu #1 is ready for discharge' }), 450);
    expect(feed.entries(450).at(-1)).toMatchObject({ text: 'Pikachu #1 is ready for discharge', tone: 'ready' });
    expect(feed.entries(450)).toHaveLength(3);
  });

  it('summarizes unknown or simultaneous patients by count', () => {
    const feed = new HudFeed();
    feed.sync(state(), 0);
    feed.sync(state({ discharged: 2, lost: 2 }), 100);
    expect(feed.entries(100).map((entry) => entry.text)).toEqual(['2 discharged', '2 patients left']);
  });

  it('floats score gains with the current streak and expires toasts and popups', () => {
    const feed = new HudFeed();
    feed.sync(state({ score: 100 }), 0);
    feed.sync(state({ score: 180, streak: 3 }), 1_000);
    feed.sync(state({ score: 150 }), 1_100);
    expect(feed.popups(1_100)).toEqual([expect.objectContaining({ points: 80, streak: 3, at: 1_000 })]);
    expect(feed.popups(1_000 + SCORE_POPUP_MS)).toEqual([]);
    feed.sync(state({ score: 150, machines: [broken, empty] }), 2_000);
    expect(feed.entries(2_000 + FEED_ENTRY_MS - 1)).toHaveLength(1);
    expect(feed.entries(2_000 + FEED_ENTRY_MS)).toEqual([]);
  });

  it('resets when play stops so the next shift starts quiet', () => {
    const feed = new HudFeed();
    feed.sync(state(), 0);
    feed.sync(state({ machines: [broken, empty] }), 100);
    feed.sync(state({ active: false }), 200);
    expect(feed.entries(200)).toEqual([]);
    feed.sync(state({ machines: [broken, empty], discharged: 9 }), 300);
    expect(feed.entries(300)).toEqual([]);
  });
});
