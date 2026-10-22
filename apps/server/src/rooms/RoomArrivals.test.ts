import { describe, expect, it } from 'vitest';
import { DISCHARGE_INTERACTION_POINT, HEALING_INTERACTION_POINT, TREATMENT,
  WAITING_INTERACTION_POINTS, patientTravelDuration } from '@pokecenter/shared';
import { RoomArrivals } from './RoomArrivals.js';
import { RoomPatients } from './RoomPatients.js';
import { PlayerState, RoomState } from './RoomState.js';

function setup(teamSize = 1) {
  const state = new RoomState();
  const patients = new RoomPatients(state);
  for (let index = 0; index < teamSize; index += 1) {
    const player = new PlayerState();
    player.connected = true;
    player.carriedPatientId = '';
    state.players.set(`staff-${index}`, player);
  }
  const arrivals = new RoomArrivals(state, patients, () => 0.8);
  state.phase = 'running';
  return { state, patients, arrivals };
}

describe('room arrivals', () => {
  it.each([329999, 330000, 359999, 360000])('admits only before the clearance cutoff at %s', (time) => {
    const { state, arrivals } = setup();
    arrivals.advance(time);
    expect(state.admittedCount).toBe(time < 330000 ? 1 : 0);
    arrivals.advance(100000);
    expect(state.admittedCount).toBe(time < 330000 ? 1 : 0);
    expect(state.lostCount).toBe(0);
  });

  it('starts only during play, after five seconds, and reserves a waiting seat', () => {
    const { state, patients, arrivals } = setup();
    state.phase = 'countdown';
    arrivals.advance(6000);
    expect(state.patients.size).toBe(0);
    state.phase = 'running';
    for (const invalid of [NaN, Infinity, -100, 0]) arrivals.advance(invalid);
    arrivals.advance(4999);
    expect(state.patients.size).toBe(0);
    arrivals.advance(1);
    expect([...state.receptionSlots]).toEqual(['', '', '', '']);
    expect([...state.waitingSlots]).toEqual(['patient-1', ...Array(7).fill('')]);
    expect(state.patients.get('patient-1')).toMatchObject({ species: 'Pikachu',
      location: 'waiting', travelKind: 'arriving', requiredTreatments: TREATMENT.healing });
    expect(() => patients.assertOwnership()).not.toThrow();
  });

  it.each([[1, 18000], [2, 16000], [3, 14000], [4, 12000]])(
    'spaces opening arrivals for a team of %s by %s milliseconds', (team, interval) => {
      const { state, arrivals } = setup(team);
      arrivals.advance(5000);
      arrivals.advance(interval - 1);
      expect(state.patients.size).toBe(1);
      arrivals.advance(1);
      expect(state.patients.get('patient-2')).toMatchObject({ species: 'Eevee',
        requiredTreatments: TREATMENT.healing | TREATMENT.antidote, slotIndex: 1 });
    });

  it('counts carried patients toward the busy solo cap and never replays missed arrivals', () => {
    const { state, patients, arrivals } = setup();
    for (let index = 0; index < 8; index += 1) arrivals.advance(30000);
    expect(state.patients.size).toBe(8);
    patients.advance(patientTravelDuration({ travelKind: 'arriving', slotIndex: 0 }));
    const first = state.patients.get('patient-1')!;
    patients.interact('staff-0', { targetId: 'waiting:0', expectedOccupantId: first.id },
      WAITING_INTERACTION_POINTS[0]!, 'down');
    expect(first.location).toBe('carrier');
    arrivals.advance(10000);
    expect(state.patients.size).toBe(8);
    expect(state.waitingSlots[0]).toBe('');
    expect(() => patients.assertOwnership()).not.toThrow();
  });

  it('reschedules on team changes, pauses for no connected staff, and resets cleanly', () => {
    const { state, patients, arrivals } = setup(2);
    arrivals.advance(5000);
    state.players.get('staff-1')!.connected = false;
    arrivals.advance(100000);
    arrivals.advance(9999);
    expect(state.patients.size).toBe(1);
    arrivals.advance(1);
    expect(state.patients.size).toBe(2);
    state.players.get('staff-0')!.connected = false;
    arrivals.advance(100000);
    arrivals.advance(100000);
    expect(state.patients.size).toBe(2);
    patients.reset();
    arrivals.reset();
    state.players.get('staff-0')!.connected = true;
    arrivals.advance(4999);
    expect(state.patients.size).toBe(0);
    arrivals.advance(1);
    expect(state.patients.get('patient-1')?.species).toBe('Pikachu');
  });

  it('completes arrival, manual treatment and departure exactly once despite competing pickups', () => {
    const { state, patients, arrivals } = setup(2);
    arrivals.advance(5000);
    const first = state.patients.get('patient-1')!;
    const pickup = { targetId: 'waiting:0', expectedOccupantId: first.id };
    expect(patients.interact('staff-0', pickup, WAITING_INTERACTION_POINTS[0]!, 'down').ok).toBe(false);
    for (const invalid of [NaN, Infinity, -1]) patients.advance(invalid);
    expect(first.travelElapsedMs).toBe(0);
    const duration = patientTravelDuration({ travelKind: 'arriving', slotIndex: 0 });
    patients.advance(duration - 1);
    expect(patients.interact('staff-0', pickup, WAITING_INTERACTION_POINTS[0]!, 'down').ok).toBe(false);
    patients.advance(1);
    expect(patients.interact('staff-0', pickup, WAITING_INTERACTION_POINTS[0]!, 'down').ok).toBe(true);
    expect(patients.interact('staff-1', pickup, WAITING_INTERACTION_POINTS[0]!, 'down').ok).toBe(false);
    expect(patients.interact('staff-0', { targetId: 'healing:0', expectedOccupantId: '' },
      HEALING_INTERACTION_POINT, 'left').ok).toBe(true);
    patients.advance(4000);
    patients.interact('staff-0', { targetId: 'healing:0', expectedOccupantId: first.id },
      HEALING_INTERACTION_POINT, 'left');
    const discharge = { targetId: 'discharge', expectedOccupantId: first.id };
    expect(patients.interact('staff-0', discharge, DISCHARGE_INTERACTION_POINT, 'up').ok).toBe(true);
    expect(first).toMatchObject({ lifecycle: 'discharged', location: 'none', travelKind: 'leaving' });
    expect(patients.interact('staff-0', discharge, DISCHARGE_INTERACTION_POINT, 'up').ok).toBe(false);
    patients.advance(20000);
    expect(state.patients.has(first.id)).toBe(false);
    expect(state.dischargedCount).toBe(1);
    arrivals.advance(16000);
    expect(state.patients.get('patient-2')?.slotIndex).toBe(0);
    expect(() => patients.assertOwnership()).not.toThrow();
  });
});

it('reserves every seat across both benches and reuses a freed seat without overbooking', () => {
  const { state, patients, arrivals } = setup(4);
  for (let index = 0; index < 8; index++) arrivals.advance(30000);
  expect([...state.waitingSlots]).toEqual(Array.from({ length: 8 }, (_, index) => `patient-${index + 1}`));
  arrivals.advance(10000);
  expect(state.patients.size).toBe(8);
  patients.advance(20000);
  expect(patients.interact('staff-0', { targetId: 'waiting:7', expectedOccupantId: 'patient-8' },
    WAITING_INTERACTION_POINTS[7]!, 'down').ok).toBe(true);
  arrivals.advance(10000);
  expect(state.waitingSlots[7]).toBe('patient-9');
  expect(state.patients.get('patient-9')).toMatchObject({ slotIndex: 7, travelKind: 'arriving' });
  expect(() => patients.assertOwnership()).not.toThrow();
});


it('accelerates solo arrivals progressively without pulling scheduled attempts forward at stage changes', () => {
  const { state, arrivals } = setup();
  const times: number[] = [];
  let count = 0;
  for (let time = 1000; time <= 100000; time += 1000) {
    arrivals.advance(1000);
    if (state.patients.size > count) times.push(time);
    count = state.patients.size;
  }
  expect(times).toEqual([5000, 23000, 41000, 55000, 69000, 79000, 89000, 99000]);
});

it.each([[1, 14000, 10000], [2, 12000, 9000], [3, 10000, 8000], [4, 9000, 7000]])(
  'uses the new interval for team %s when an attempt lands exactly on either stage boundary',
  (team, growingInterval, busyInterval) => {
    const { state, arrivals } = setup(team);
    arrivals.advance(5000);
    arrivals.advance(25000);
    expect(state.patients.size).toBe(2);
    arrivals.advance(growingInterval - 1);
    expect(state.patients.size).toBe(2);
    arrivals.advance(1);
    expect(state.patients.size).toBe(3);
    arrivals.advance(30000 - growingInterval);
    expect(state.patients.size).toBe(4);
    arrivals.advance(busyInterval - 1);
    expect(state.patients.size).toBe(4);
    arrivals.advance(1);
    expect(state.patients.size).toBe(5);
  });

it.each([[1, 4, 6, 8], [2, 5, 7, 9], [3, 6, 8, 10], [4, 6, 8, 10]])(
  'enforces each stage population cap for team %s even with free waiting seats',
  (team, openingCap, growingCap, busyCap) => {
    for (const [time, cap] of [[5000, openingCap], [30000, growingCap], [60000, busyCap]]) {
      const { state, patients, arrivals } = setup(team);
      for (let index = 0; index < cap!; index++) {
        expect(patients.admit('Pikachu', TREATMENT.healing, index < 4 ? index : index - 4,
          index < 4 ? 'reception' : 'waiting')).not.toBeNull();
      }
      expect([...state.waitingSlots].some((id) => !id)).toBe(true);
      arrivals.advance(time!);
      expect(state.patients.size).toBe(cap);
      expect(state.lostCount).toBe(0);
      expect(() => patients.assertOwnership()).not.toThrow();
    }
  });

it.each([1, 2, 3, 4])('fills all eight seats progressively with live patience and travel for %s staff', (team) => {
  const { state, patients, arrivals } = setup(team);
  let peak = 0;
  const occupiedSeats = new Set<number>();
  for (let time = 50; time <= 180000; time += 50) {
    // Match the authoritative room tick: expire patients before trying an admission.
    patients.advance(50);
    arrivals.advance(50);
    const waiting = [...state.waitingSlots].filter(Boolean).length;
    peak = Math.max(peak, waiting);
    for (const [index, id] of [...state.waitingSlots].entries()) if (id) occupiedSeats.add(index);
    if (time === 30000) expect(waiting).toBeLessThanOrEqual(3);
    if (time === 60000) expect(waiting).toBeLessThanOrEqual(6);
    expect(waiting).toBeLessThanOrEqual(8);
    expect(() => patients.assertOwnership()).not.toThrow();
  }
  expect(peak).toBe(8);
  expect([...occupiedSeats].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  expect(state.lostCount).toBeGreaterThan(0); // No care was provided; patience remains effective.
});

it('keeps existing patients after a team reduction and resumes only after capacity becomes available', () => {
  const { state, patients, arrivals } = setup(4);
  for (let index = 0; index < 4; index++) patients.admit('Pikachu', TREATMENT.healing, index);
  for (let index = 0; index < 5; index++) patients.admit('Eevee', TREATMENT.healing, index, 'waiting');
  arrivals.advance(60000);
  expect(state.patients.size).toBe(10);
  for (const id of ['staff-1', 'staff-2', 'staff-3']) state.players.get(id)!.connected = false;
  arrivals.advance(1);
  arrivals.advance(10000);
  expect(state.patients.size).toBe(10);
  expect(state.lostCount).toBe(0);
  for (const id of ['patient-1', 'patient-2', 'patient-3']) state.patients.get(id)!.remainingPatienceMs = 1;
  patients.advance(1);
  arrivals.advance(9999);
  expect(state.waitingSlots[6]).toBe('');
  arrivals.advance(1);
  expect(state.waitingSlots[6]).toBe('patient-11');
  expect(state.lostCount).toBe(3);
  expect(() => patients.assertOwnership()).not.toThrow();
});

it('does not progress pacing outside play and resets the warm-up after a busy session', () => {
  const { state, patients, arrivals } = setup();
  arrivals.advance(100000);
  patients.reset();
  arrivals.reset();
  for (const phase of ['lobby', 'countdown', 'results']) {
    state.phase = phase;
    arrivals.advance(100000);
  }
  state.phase = 'running';
  for (const invalid of [NaN, Infinity, 0, -1]) arrivals.advance(invalid);
  arrivals.advance(4999);
  expect(state.patients.size).toBe(0);
  arrivals.advance(1);
  expect(state.patients.get('patient-1')?.species).toBe('Pikachu');
  arrivals.advance(17999);
  expect(state.patients.size).toBe(1);
  arrivals.advance(1);
  expect(state.patients.size).toBe(2);
});

it('continues the stage clock while staff are absent and schedules a full interval on reconnect', () => {
  const { state, arrivals } = setup();
  state.players.get('staff-0')!.connected = false;
  arrivals.advance(120000);
  expect(state.patients.size).toBe(0);
  state.players.get('staff-0')!.connected = true;
  arrivals.advance(1);
  arrivals.advance(9999);
  expect(state.patients.size).toBe(0);
  arrivals.advance(1);
  expect(state.patients.size).toBe(1);
});
