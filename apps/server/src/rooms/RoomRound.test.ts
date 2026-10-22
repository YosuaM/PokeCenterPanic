import { describe, expect, it } from 'vitest';
import { DISCHARGE_INTERACTION_POINT, HEALING_INTERACTION_POINT, RECEPTION_INTERACTION_POINTS,
  TREATMENT } from '@pokecenter/shared';
import { RoomPatients } from './RoomPatients.js';
import { RoomMedicine } from './RoomMedicine.js';
import { RoomMovement } from './RoomMovement.js';
import { RoomRound } from './RoomRound.js';
import { PlayerState, RoomState } from './RoomState.js';

function setup(duration = 10000) {
  const state = new RoomState();
  const patients = new RoomPatients(state);
  const medicine = new RoomMedicine(state);
  const movement = new RoomMovement();
  const player = new PlayerState();
  player.connected = true;
  player.carriedPatientId = '';
  player.carriedMedicineId = '';
  state.players.set('red', player);
  movement.add('red');
  const round = new RoomRound(state, patients, medicine, movement, duration);
  state.phase = 'running';
  round.start(1000);
  const pickup = (id: string, index = 0) => patients.interact('red', {
    targetId: `reception:${index}`, expectedOccupantId: id }, RECEPTION_INTERACTION_POINTS[index]!, 'up');
  const discharge = (id: string) => patients.interact('red', { targetId: 'discharge', expectedOccupantId: id },
    DISCHARGE_INTERACTION_POINT, 'up');
  return { state, patients, medicine, movement, player, round, pickup, discharge };
}

describe('RoomRound', () => {
  it('freezes the worked scoring example, retaining counts after departure animations finish', () => {
    const { state, patients, round, pickup, discharge } = setup();
    const admitted = Array.from({ length: 5 }, (_, index) => patients.admit('Eevee', TREATMENT.healing,
      index < 4 ? index : 0, index < 4 ? 'reception' : 'waiting')!);
    for (let index = 0; index < 3; index++) {
      const patient = admitted[index]!;
      patient.completedTreatments = TREATMENT.healing;
      patient.remainingPatienceMs = [72000, 45000, 18000][index]!;
      expect(pickup(patient.id, index).ok).toBe(true);
      expect(discharge(patient.id).ok).toBe(true);
      expect(discharge(patient.id).ok).toBe(false);
    }
    admitted[3]!.remainingPatienceMs = 1;
    round.advance(1001);
    expect(state.score).toBe(325);
    round.advance(11000);
    expect(state.phase).toBe('results');
    expect(state.results.toJSON()).toEqual({ score: 325, admitted: 5, discharged: 3,
      lost: 1, unfinished: 1, stars: 1 });
    expect(admitted[4]!.lifecycle).toBe('unfinished');
    expect(state.patients.has(admitted[0]!.id)).toBe(false);
    const frozen = state.toJSON();
    for (const time of [11000, 12000, 99999, NaN]) round.advance(time);
    expect(state.toJSON()).toEqual(frozen);
    expect(() => patients.assertOwnership()).not.toThrow();
  });

  it.each([9999, 10000, 10001])('prioritizes the deadline over patience expiry at %s ms', (patience) => {
    const { state, patients, round, pickup, player } = setup();
    const patient = patients.admit('Pikachu', TREATMENT.healing, 0)!;
    patient.completedTreatments = TREATMENT.healing;
    patient.remainingPatienceMs = patience;
    pickup(patient.id);
    round.advance(11000);
    expect(patient.lifecycle).toBe(patience < 10000 ? 'lost' : 'unfinished');
    expect(state.results).toMatchObject({ admitted: 1, lost: patience < 10000 ? 1 : 0,
      unfinished: patience < 10000 ? 0 : 1, discharged: 0, score: patience < 10000 ? -50 : 0 });
    expect(player.carriedPatientId).toBe('');
  });

  it('accepts a pre-deadline discharge and loses a pre-deadline patience tie', () => {
    const { state, patients, round, pickup, discharge } = setup();
    const patient = patients.admit('Pikachu', TREATMENT.healing, 0)!;
    patient.completedTreatments = TREATMENT.healing;
    pickup(patient.id);
    round.advance(10999);
    expect(discharge(patient.id).ok).toBe(true);
    expect(state.score).toBe(144);
    round.advance(11000);
    expect(state.results).toMatchObject({ discharged: 1, unfinished: 0, stars: 3 });
    const second = setup();
    const expiring = second.patients.admit('Pikachu', TREATMENT.healing, 0)!;
    expiring.remainingPatienceMs = 9999;
    expiring.completedTreatments = TREATMENT.healing;
    second.pickup(expiring.id);
    second.round.advance(10999);
    expect(second.discharge(expiring.id).ok).toBe(false);
    expect(second.state.score).toBe(-50);
  });

  it.each([3999, 4000])('handles healing completion at %s ms around the round boundary', (remainingMs) => {
    const { state, patients, round, pickup } = setup(4000);
    const patient = patients.admit('Pikachu', TREATMENT.healing, 0)!;
    pickup(patient.id);
    patients.interact('red', { targetId: 'healing:0', expectedOccupantId: '' }, HEALING_INTERACTION_POINT, 'left');
    state.healingMachine.remainingMs = remainingMs;
    round.advance(5000);
    expect(patient.completedTreatments).toBe(remainingMs < 4000 ? TREATMENT.healing : 0);
    expect(patient.lifecycle).toBe('unfinished');
    expect(state.healingMachine).toMatchObject({ status: 'empty', remainingMs: 0, patientId: '' });
  });

  it('keeps advancing without connected staff and clears held actions, inventory and movement at results', () => {
    const { state, medicine, movement, round, player } = setup();
    Object.assign(movement.position('red')!, { x: 400, y: 114 });
    expect(medicine.interact('red', { targetId: 'medicine:prep:0', expectedOccupantId: '',
      sequence: 1, roundId: 'round' }, { x: 400, y: 114 }, 'up', 1000, true).ok).toBe(true);
    player.connected = false;
    round.advance(2000);
    expect(state.roundRemainingMs).toBe(9000);
    expect(state.medicinePreparationOwners[0]).toBe('');
    round.advance(12000);
    expect(state.results).toMatchObject({ score: 0, admitted: 0, stars: 0 });
    expect(state.medicineDoses.size).toBe(0);
    expect(player.carriedMedicineId).toBe('');
    expect(() => medicine.assertOwnership()).not.toThrow();
  });

  it('ignores invalid/backward time and resets timers for a second round', () => {
    const { state, round, patients } = setup();
    patients.admit('Pikachu', TREATMENT.healing, 0);
    for (const time of [NaN, Infinity, 999]) round.advance(time);
    expect(state.roundRemainingMs).toBe(10000);
    round.advance(11000);
    patients.reset();
    round.reset();
    expect(state.results.admitted).toBe(0);
    expect(state.admittedCount).toBe(0);
    expect(state.roundRemainingMs).toBe(10000);
    state.phase = 'running';
    round.start(20000);
    round.advance(20001);
    expect(state.roundRemainingMs).toBe(9999);
    expect(state.phase).toBe('running');
  });
});
