import { describe, expect, it } from 'vitest';
import { DISCHARGE_INTERACTION_POINT, HEALING_INTERACTION_POINT, RECEPTION_INTERACTION_POINTS,
  WAITING_INTERACTION_POINTS, PATIENT_FAINT_DURATION_MS, TREATMENT } from '@pokecenter/shared';
import { RoomPatients } from './RoomPatients.js';
import { PlayerState, RoomState } from './RoomState.js';

function setup() {
  const state = new RoomState();
  const patients = new RoomPatients(state);
  const player = new PlayerState();
  player.x = 480;
  player.y = 365;
  player.carriedPatientId = '';
  state.players.set('staff', player);
  const admit = () => patients.admit('Pikachu', TREATMENT.healing, 0)!;
  const pickUp = (id: string) => patients.interact('staff', { targetId: 'reception:0', expectedOccupantId: id },
    RECEPTION_INTERACTION_POINTS[0]!, 'up');
  const heal = () => patients.interact('staff', { targetId: 'healing:0', expectedOccupantId: '' },
    HEALING_INTERACTION_POINT, 'left');
  return { state, patients, player, admit, pickUp, heal };
}

describe('patient patience', () => {
  it.each(['reception', 'waiting', 'carrier', 'arriving'] as const)(
    'expires once while in %s and frees ownership before the faint animation', (location) => {
      const { state, patients, player, admit, pickUp } = setup();
      const patient = location === 'arriving' ? patients.admit('Pikachu', 1, 0, 'waiting')! : admit();
      if (location === 'carrier' || location === 'waiting') pickUp(patient.id);
      if (location === 'waiting') patients.interact('staff', { targetId: 'waiting:0', expectedOccupantId: '' },
        WAITING_INTERACTION_POINTS[0]!, 'down');
      patient.remainingPatienceMs = 100;
      for (const invalid of [-1, 0, NaN, Infinity]) patients.advance(invalid);
      expect(patient.remainingPatienceMs).toBe(100);
      patients.advance(99);
      expect(patient.lifecycle).toBe('active');
      patients.advance(1);
      expect(patient).toMatchObject({ lifecycle: 'lost', location: 'none', slotIndex: -1,
        carrierId: '', remainingPatienceMs: 0, travelKind: 'fainting', travelElapsedMs: 0 });
      expect(state.lostCount).toBe(1);
      expect(player.carriedPatientId).toBe('');
      expect([...state.receptionSlots, ...state.waitingSlots].every((id) => !id)).toBe(true);
      expect(Number.isFinite(patient.faintX)).toBe(true);
      if (location === 'carrier') expect([patient.faintX, patient.faintY]).toEqual([480, 365]);
      expect(pickUp(patient.id).ok).toBe(false);
      expect(() => patients.releaseCarrier('staff')).not.toThrow();
      expect(patients.interact('staff', { targetId: 'discharge', expectedOccupantId: patient.id },
        DISCHARGE_INTERACTION_POINT, 'up').ok).toBe(false);
      patients.advance(PATIENT_FAINT_DURATION_MS);
      patients.advance(90000);
      expect(state.lostCount).toBe(1);
      expect(state.dischargedCount).toBe(0);
      expect(state.patients.size).toBe(0);
      patients.reset();
      expect(state.lostCount).toBe(0);
    });

  it.each([[4500], [1000, 3000, 500], [4000, 250, 250]])(
    'pauses only unfinished active healing and charges the remainder of a tick (%j)', (...steps) => {
      const { state, patients, admit, pickUp, heal } = setup();
      const patient = admit();
      pickUp(patient.id);
      expect(heal().ok).toBe(true);
      patient.remainingPatienceMs = 1000;
      for (const step of steps) patients.advance(step);
      expect(patient.remainingPatienceMs).toBe(500);
      expect(patient.completedTreatments).toBe(TREATMENT.healing);
      expect(state.healingMachine.status).toBe('completed');
      patients.advance(500);
      expect(patient.lifecycle).toBe('lost');
      expect(state.healingMachine).toMatchObject({ patientId: '', status: 'empty', remainingMs: 0 });
      expect(() => patients.assertOwnership()).not.toThrow();
    });

  it('does not heal an already expired patient and does not pause during an outage', () => {
    const { state, patients, admit, pickUp, heal } = setup();
    const patient = admit();
    pickUp(patient.id);
    heal();
    patient.remainingPatienceMs = 200;
    state.healingMachine.status = 'broken';
    patients.advance(200);
    expect(patient.completedTreatments).toBe(0);
    expect(state.lostCount).toBe(1);
    expect(state.healingMachine.status).toBe('broken');
    state.healingMachine.status = 'empty';
    const second = admit();
    pickUp(second.id);
    heal();
    second.remainingPatienceMs = 0;
    patients.advance(4000);
    expect(second.lifecycle).toBe('lost');
    expect(second.completedTreatments).toBe(0);
    expect(state.lostCount).toBe(2);
  });

  it('reindexes the recovery queue when its head expires and clears the remaining patient', () => {
    const { state, patients, admit, pickUp } = setup();
    for (let index = 0; index < state.waitingSlots.length + 2; index += 1) {
      const patient = admit();
      pickUp(patient.id);
      patients.releaseCarrier('staff');
    }
    const [head, tail] = [...state.recoveryQueue];
    state.patients.get(head!)!.remainingPatienceMs = 10;
    patients.advance(10);
    expect([...state.recoveryQueue]).toEqual([tail]);
    expect(state.patients.get(tail!)!.slotIndex).toBe(0);
    state.patients.get(tail!)!.remainingPatienceMs = 10;
    patients.advance(10);
    expect([...state.recoveryQueue]).toEqual([]);
    expect(state.lostCount).toBe(2);
    expect(() => patients.assertOwnership()).not.toThrow();
  });

  it('does not lose discharged patients or reset their patience during transport and care', () => {
    const { state, patients, admit, pickUp, heal } = setup();
    const patient = admit();
    patients.advance(500);
    pickUp(patient.id);
    patients.advance(500);
    heal();
    patients.advance(4000);
    expect(patient.remainingPatienceMs).toBe(89000);
    patients.interact('staff', { targetId: 'healing:0', expectedOccupantId: patient.id }, HEALING_INTERACTION_POINT, 'left');
    expect(patients.interact('staff', { targetId: 'discharge', expectedOccupantId: patient.id },
      DISCHARGE_INTERACTION_POINT, 'up').ok).toBe(true);
    patients.advance(100000);
    expect(state.lostCount).toBe(0);
    expect(state.dischargedCount).toBe(1);
  });
});

it('frees the last added waiting seat on expiry and leaves its replacement owned', () => {
  const { state, patients } = setup();
  const patient = patients.admit('Pikachu', TREATMENT.healing, 7, 'waiting')!;
  patient.remainingPatienceMs = 1;
  patients.advance(1);
  expect(state.waitingSlots[7]).toBe('');
  expect(patient.lifecycle).toBe('lost');
  const next = patients.admit('Eevee', TREATMENT.antidote, 7, 'waiting')!;
  patients.advance(PATIENT_FAINT_DURATION_MS);
  expect(state.waitingSlots[7]).toBe(next.id);
  expect(() => patients.assertOwnership()).not.toThrow();
});
