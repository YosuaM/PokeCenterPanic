import { describe, expect, it } from 'vitest';
import { HEALING_INTERACTION_POINTS, HEALING_MACHINE_POSITIONS, TREATMENT } from '@pokecenter/shared';
import { RoomIncidents } from './RoomIncidents.js';
import { RoomPatients } from './RoomPatients.js';
import { RoomMedicine } from './RoomMedicine.js';
import { RoomMovement } from './RoomMovement.js';
import { RoomRound } from './RoomRound.js';
import { PlayerState, RoomState, roomHealingMachines } from './RoomState.js';

function setup() {
  const state = new RoomState();
  const patients = new RoomPatients(state);
  const medicine = new RoomMedicine(state);
  const movement = new RoomMovement();
  for (const id of ['red', 'blue']) {
    const player = new PlayerState();
    player.connected = true;
    player.carriedPatientId = '';
    player.carriedMedicineId = '';
    state.players.set(id, player);
    movement.add(id);
    Object.assign(movement.position(id)!, HEALING_INTERACTION_POINTS[0]);
  }
  const incidents = new RoomIncidents(state);
  const round = new RoomRound(state, patients, medicine, movement, 360000, incidents);
  state.phase = 'running';
  state.roundId = 'round';
  round.start(1000);
  const pikachu = patients.admit('Pikachu', TREATMENT.burnHeal, 0)!;
  pikachu.remainingPatienceMs = 45000;
  const evaluate = (elapsed = 60000, now = elapsed + 1000) => {
    state.roundRemainingMs = 360000 - elapsed;
    incidents.evaluate(now, elapsed);
  };
  const repair = (id = 'red', now = 61000, index = 0, expected = roomHealingMachines(state)[index]!.patientId) =>
    incidents.interact(id, { targetId: `healing:${index}`, expectedOccupantId: expected },
      HEALING_INTERACTION_POINTS[index]!, 'down', now, true);
  const tick = (now: number, held = true) => {
    round.advance(now);
    incidents.onInput('red', held, null, now);
  };
  return { state, patients, medicine, movement, incidents, round, pikachu, evaluate, repair, tick };
}

describe('Pikachu outage eligibility', () => {
  it.each([59999, 60000, 329999, 330000])('respects the incident window at %s ms', (time) => {
    const { state, evaluate } = setup();
    evaluate(time);
    expect(state.healingMachine.status).toBe(time >= 60000 && time < 330000 ? 'broken' : 'empty');
    expect(state.secondHealingMachine.status).toBe('empty');
  });

  it.each([45001, 45000, 1, 0])('requires positive patience at or below half: %s', (remaining) => {
    const { state, pikachu, evaluate } = setup();
    pikachu.remainingPatienceMs = remaining;
    evaluate();
    expect(state.healingMachine.status).toBe(remaining > 0 && remaining <= 45000 ? 'broken' : 'empty');
  });

  it('rejects terminal patients, other species, invalid times and rounds without connected staff', () => {
    for (const invalid of ['phase', 'disconnected', 'discharged', 'lost', 'unfinished', 'species', 'budget', 'time']) {
      const { state, pikachu, incidents, evaluate } = setup();
      if (invalid === 'phase') state.phase = 'results';
      if (invalid === 'disconnected') for (const player of state.players.values()) player.connected = false;
      if (['discharged', 'lost', 'unfinished'].includes(invalid)) pikachu.lifecycle = invalid;
      if (invalid === 'species') pikachu.species = 'Eevee';
      if (invalid === 'budget') pikachu.initialPatienceMs = 0;
      if (invalid === 'time') incidents.evaluate(NaN, 60000);
      else evaluate();
      expect(state.healingMachine.status, invalid).toBe('empty');
    }
  });

  it('chooses the least patient Pikachu, breaks ties by ID and uses stable station order', () => {
    const { state, patients, pikachu, evaluate } = setup();
    const second = patients.admit('Pikachu', TREATMENT.burnHeal, 1)!;
    const third = patients.admit('Pikachu', TREATMENT.burnHeal, 2)!;
    pikachu.remainingPatienceMs = 40000;
    second.remainingPatienceMs = third.remainingPatienceMs = 30000;
    evaluate();
    expect(state.healingMachine.status).toBe('broken');
    state.healingMachine.status = 'empty';
    third.remainingPatienceMs = 45001;
    pikachu.remainingPatienceMs = 45001;
    evaluate(120000);
    expect(state.healingMachine.status).toBe('empty'); // The tied second patient already triggered once.
    third.remainingPatienceMs = 30000;
    evaluate(120000);
    expect(state.healingMachine.status).toBe('broken');
  });

  it('enforces one outage per patient, the cooldown and one broken machine at a time, then resets history', () => {
    const { state, patients, incidents, pikachu, evaluate } = setup();
    evaluate();
    const second = patients.admit('Pikachu', TREATMENT.healing, 1)!;
    second.remainingPatienceMs = 20000;
    evaluate(120000);
    expect(state.secondHealingMachine.status).toBe('empty');
    state.healingMachine.status = 'empty';
    evaluate(119999);
    expect(state.healingMachine.status).toBe('empty');
    evaluate(120000);
    expect(state.healingMachine.status).toBe('broken');
    state.healingMachine.status = 'empty';
    evaluate(180000);
    expect(state.healingMachine.status).toBe('empty');
    incidents.reset();
    second.remainingPatienceMs = 45001;
    pikachu.remainingPatienceMs = 40000;
    evaluate();
    expect(state.healingMachine.status).toBe('broken');
  });
});

describe('machine repair and simulation ordering', () => {
  it('interrupts after one second, preserves three seconds and resumes only after repair completion', () => {
    const { state, patients, movement, incidents, round, pikachu, evaluate, repair, tick } = setup();
    pikachu.remainingPatienceMs = 90000;
    round.advance(61000);
    const patient = patients.admit('Eevee', TREATMENT.healing, 1)!;
    patients.interact('red', { targetId: 'reception:1', expectedOccupantId: patient.id }, { x: 412, y: 334 }, 'up');
    patients.interact('red', { targetId: 'healing:0', expectedOccupantId: '' }, HEALING_INTERACTION_POINTS[0]!, 'down');
    round.advance(62000);
    evaluate(61000, 62000);
    expect(state.healingMachine).toMatchObject({ status: 'broken', patientId: patient.id, remainingMs: 3000 });
    expect(repair('red', 62000).ok).toBe(true);
    for (let now = 62100; now <= 63900; now += 100) tick(now);
    round.advance(64500); // Repair finishes at 64000; healing advances for the final 500 ms only.
    expect(state.healingMachine).toMatchObject({ status: 'treating', remainingMs: 2500, repairOwnerId: '', repairRemainingMs: 0 });
    expect(patient.remainingPatienceMs).toBe(88000);
    expect(patient.completedTreatments).toBe(0);
    expect(incidents.requiresRelease('red')).toBe(true);
    expect(patients.interact('blue', { targetId: 'healing:0', expectedOccupantId: patient.id },
      movement.position('blue')!, 'up').ok).toBe(false);
    round.advance(67000);
    expect(state.healingMachine.status).toBe('completed');
    expect(patient.completedTreatments).toBe(TREATMENT.healing);
    expect(() => patients.assertOwnership()).not.toThrow();
  });

  it.each(['release', 'movement', 'timeout', 'disconnect', 'range'])(
    'cancels repair on %s without consuming preserved healing time', (cause) => {
      const { state, incidents, movement, evaluate, repair } = setup();
      evaluate();
      state.healingMachine.remainingMs = 3000;
      expect(repair().ok).toBe(true);
      incidents.advance(61100, (id) => movement.position(id), () => 'up');
      expect(state.healingMachine.repairRemainingMs).toBe(1900);
      if (cause === 'release') incidents.onInput('red', false, null, 61100);
      if (cause === 'movement') incidents.onInput('red', true, 'up', 61100);
      if (cause === 'disconnect') incidents.releasePlayer('red');
      if (cause === 'range') Object.assign(movement.position('red')!, { x: 480, y: 450 });
      incidents.advance(cause === 'timeout' ? 61250 : 61101, (id) => movement.position(id), () => 'up');
      expect(state.healingMachine).toMatchObject({ status: 'broken', remainingMs: 3000,
        repairOwnerId: '', repairRemainingMs: 0 });
      expect(incidents.isRepairing('red')).toBe(false);
    });

  it('permits only one empty-handed stationary repair with the expected occupant and clear access', () => {
    const { state, incidents, evaluate, repair } = setup();
    evaluate();
    expect(repair('red', 61000, 0, 'stale').reason).toBe('Machine occupant changed');
    state.players.get('red')!.carriedMedicineId = 'dose';
    expect(repair().ok).toBe(false);
    state.players.get('red')!.carriedMedicineId = '';
    state.players.get('red')!.carriedPatientId = 'patient';
    expect(repair().ok).toBe(false);
    state.players.get('red')!.carriedPatientId = '';
    expect(incidents.interact('red', { targetId: 'healing:0', expectedOccupantId: '' },
      HEALING_INTERACTION_POINTS[0]!, 'up', 61000, false).ok).toBe(false);
    expect(incidents.interact('red', { targetId: 'healing:0', expectedOccupantId: '' },
      { x: 50, y: 0 }, 'up', 61000, true).ok).toBe(false);
    expect(repair().ok).toBe(true);
    expect(repair('blue').reason).toBe('Repair in progress');
    expect(repair().ok).toBe(false);
    expect(state.healingMachine.repairOwnerId).toBe('red');
  });

  it.each([0, 1])('repairs empty or completed machine %s without undoing treatment', (index) => {
    for (const completed of [false, true]) {
      const { state, patients, movement, incidents, repair } = setup();
      const machine = roomHealingMachines(state)[index]!;
      Object.assign(movement.position('red')!, HEALING_INTERACTION_POINTS[index]);
      if (completed) {
        const patient = patients.admit('Eevee', TREATMENT.healing | TREATMENT.antidote, 1)!;
        patient.completedTreatments = TREATMENT.healing;
        state.receptionSlots[1] = '';
        patient.location = 'healingMachine';
        patient.slotIndex = index;
        machine.patientId = patient.id;
      }
      machine.status = 'broken';
      expect(repair('red', 61000, index).ok).toBe(true);
      for (let now = 61100; now <= 63000; now += 100) {
        incidents.onInput('red', true, null, now);
        incidents.advance(now, (id) => movement.position(id), () => 'up');
      }
      expect(machine.status).toBe(completed ? 'completed' : 'empty');
      expect(repair('red', 63100, index).ok).toBe(false);
      expect(() => patients.assertOwnership()).not.toThrow();
    }
  });

  it.each([1999, 2000])('resolves patient expiry at %s ms before completing repair', (patience) => {
    const { state, patients, round, pikachu, evaluate, repair, tick } = setup();
    pikachu.remainingPatienceMs = 90000;
    round.advance(61000);
    const patient = patients.admit('Eevee', TREATMENT.healing, 1)!;
    state.receptionSlots[1] = '';
    patient.location = 'healingMachine';
    patient.slotIndex = 0;
    patient.remainingPatienceMs = patience;
    state.healingMachine.patientId = patient.id;
    state.healingMachine.status = 'treating';
    state.healingMachine.remainingMs = 3000;
    evaluate();
    repair();
    for (let now = 61100; now <= 63000; now += 100) tick(now);
    expect(state.healingMachine).toMatchObject({ status: 'empty', patientId: '', remainingMs: 0 });
    expect(patient).toMatchObject({ lifecycle: 'lost', completedTreatments: 0 });
    expect(patient.faintX).toBe(HEALING_MACHINE_POSITIONS[0]!.x);
    expect(state.lostCount).toBe(1);
    expect(state.score).toBe(-50);
    round.advance(65000);
    expect(state.lostCount).toBe(1);
  });

  it('lets input expiry win an exact completion tie and requires a release after cancellation', () => {
    const { state, incidents, movement, evaluate, repair } = setup();
    evaluate();
    repair();
    for (let now = 61100; now <= 62700; now += 100) incidents.onInput('red', true, null, now);
    incidents.onInput('red', true, null, 62750);
    incidents.advance(63000, (id) => movement.position(id), () => 'up');
    expect(state.healingMachine.status).toBe('broken');
    expect(state.healingMachine.repairOwnerId).toBe('');
    expect(repair('red', 63001).reason).toBe('Release E before interacting again');
    incidents.onInput('red', false, null, 63001);
    expect(repair('red', 63002).ok).toBe(true);
  });

  it('ends the round before a simultaneous repair completion and clears all locks on replay', () => {
    const { state, patients, medicine, movement, incidents } = setup();
    const round = new RoomRound(state, patients, medicine, movement, 2000, incidents);
    round.start(61000);
    state.healingMachine.status = 'broken';
    expect(incidents.interact('red', { targetId: 'healing:0', expectedOccupantId: '' },
      HEALING_INTERACTION_POINTS[0]!, 'up', 61000, true).ok).toBe(true);
    for (let now = 61100; now <= 62900; now += 100) {
      round.advance(now);
      incidents.onInput('red', true, null, now);
    }
    round.advance(63000);
    expect(state.phase).toBe('results');
    expect(state.healingMachine.repairOwnerId).toBe('');
    expect(incidents.isRepairing('red')).toBe(false);
    expect(incidents.requiresRelease('red')).toBe(false);
    patients.reset();
    round.reset();
    expect(roomHealingMachines(state).every((machine) => machine.status === 'empty')).toBe(true);
  });
});
