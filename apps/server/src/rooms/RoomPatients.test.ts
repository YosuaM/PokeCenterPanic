import { describe, expect, it } from 'vitest';
import { TREATMENT } from '@pokecenter/shared';
import { RoomPatients, seedPrototypePatient } from './RoomPatients.js';
import { PlayerState, RoomState } from './RoomState.js';

function addPlayer(state: RoomState, id: string): void {
  const player = new PlayerState();
  player.name = id;
  player.x = 456;
  player.y = 422;
  player.slot = state.players.size;
  player.facing = 'up';
  player.carriedPatientId = '';
  state.players.set(id, player);
}

describe('RoomPatients', () => {
  it('clears abandoned patient state before the room returns to lobby', () => {
    const state = new RoomState();
    const patients = new RoomPatients(state);
    patients.admit('Pikachu', TREATMENT.healing, 0);
    patients.reset();
    expect(state.patients.size).toBe(0);
    expect([...state.receptionSlots]).toEqual(['', '', '', '']);
    expect(state.healingMachine.status).toBe('empty');
    expect(patients.admit('Pikachu', TREATMENT.healing, 0)?.id).toBe('patient-1');
  });
  it('admits one controlled patient into a reception slot with consistent ownership', () => {
    const state = new RoomState();
    const patients = new RoomPatients(state);
    seedPrototypePatient(patients);
    const patient = state.patients.get('patient-1');
    expect([...state.receptionSlots]).toEqual(['patient-1', '', '', '']);
    expect(patient).toMatchObject({
      id: 'patient-1', species: 'Pikachu', requiredTreatments: TREATMENT.healing,
      completedTreatments: 0, initialPatienceMs: 90_000, remainingPatienceMs: 90_000,
      lifecycle: 'active', location: 'reception', slotIndex: 0, carrierId: '',
    });
    expect(() => patients.assertOwnership()).not.toThrow();
  });

  it('does not create or change patients when a slot or treatment request is invalid', () => {
    const state = new RoomState();
    const patients = new RoomPatients(state);
    const first = patients.admit('Pikachu', TREATMENT.healing, 0);
    expect(patients.admit('Eevee', TREATMENT.burnHeal, 0)).toBeNull();
    expect(patients.admit('Eevee', TREATMENT.burnHeal | TREATMENT.antidote, 1)).toBeNull();
    expect(patients.admit('Unknown' as 'Pikachu', TREATMENT.healing, 1)).toBeNull();
    expect(patients.admit('Eevee', TREATMENT.burnHeal, 4)).toBeNull();
    expect(state.patients.size).toBe(1);
    expect(state.receptionSlots[0]).toBe(first?.id);
    expect(patients.admit('Eevee', TREATMENT.burnHeal, 1)?.id).toBe('patient-2');
    expect(() => patients.assertOwnership()).not.toThrow();
  });

  it('detects a mismatched or duplicated slot owner', () => {
    const state = new RoomState();
    const patients = new RoomPatients(state);
    const patient = patients.admit('Pikachu', TREATMENT.healing, 0)!;
    state.receptionSlots[1] = patient.id;
    expect(() => patients.assertOwnership()).toThrow('Invalid reception owner');
    state.receptionSlots[1] = '';
    state.receptionSlots[0] = '';
    expect(() => patients.assertOwnership()).toThrow('Unowned active patient');
  });

  it('lets only one player claim the expected reception patient', () => {
    const state = new RoomState();
    const patients = new RoomPatients(state);
    addPlayer(state, 'red');
    addPlayer(state, 'blue');
    const first = patients.admit('Pikachu', TREATMENT.healing, 0)!;
    const second = patients.admit('Eevee', TREATMENT.healing, 1)!;
    const request = { targetId: 'reception:0', expectedOccupantId: first.id };
    expect(patients.interact('red', request, { x: 177, y: 194 }, 'up')).toEqual({ ok: true, reason: '' });
    expect(patients.interact('blue', request, { x: 177, y: 194 }, 'up'))
      .toEqual({ ok: false, reason: 'Patient already claimed or removed' });
    expect(patients.interact('red', request, { x: 177, y: 194 }, 'up').ok).toBe(false);
    expect(state.players.get('red')?.carriedPatientId).toBe(first.id);
    expect(state.players.get('blue')?.carriedPatientId).toBe('');
    expect(first).toMatchObject({ location: 'carrier', carrierId: 'red', slotIndex: -1 });
    expect(state.receptionSlots[0]).toBe('');
    expect(state.receptionSlots[1]).toBe(second.id);
    expect(() => patients.assertOwnership()).not.toThrow();
  });

  it('rejects forged, distant, and wrongly faced interactions without changing ownership', () => {
    const state = new RoomState();
    const patients = new RoomPatients(state);
    addPlayer(state, 'red');
    const patient = patients.admit('Pikachu', TREATMENT.healing, 0)!;
    const request = { targetId: 'reception:0', expectedOccupantId: patient.id };
    expect(patients.interact('red', request, { x: 177, y: 194 }, 'down').ok).toBe(false);
    expect(patients.interact('red', request, { x: 456, y: 422 }, 'up').ok).toBe(false);
    expect(patients.interact('red', { targetId: 'reception:9', expectedOccupantId: patient.id },
      { x: 177, y: 194 }, 'up').ok).toBe(false);
    expect(patients.interact('red', { targetId: 'reception:0', expectedOccupantId: 'other' },
      { x: 177, y: 194 }, 'up').ok).toBe(false);
    expect(patients.interact('red', { targetId: 'reception:0', expectedOccupantId: 4 },
      { x: 177, y: 194 }, 'up').ok).toBe(false);
    expect(state.receptionSlots[0]).toBe(patient.id);
    expect(state.players.get('red')?.carriedPatientId).toBe('');
  });

  it('places and retrieves a patient in waiting without changing medical state', () => {
    const state = new RoomState();
    const patients = new RoomPatients(state);
    addPlayer(state, 'red');
    addPlayer(state, 'blue');
    const patient = patients.admit('Pikachu', TREATMENT.healing, 0)!;
    patients.interact('red', { targetId: 'reception:0', expectedOccupantId: patient.id },
      { x: 177, y: 194 }, 'up');
    expect(patients.interact('red', { targetId: 'waiting:0', expectedOccupantId: '' },
      { x: 130, y: 350 }, 'down').ok).toBe(true);
    expect(patient).toMatchObject({ location: 'waiting', slotIndex: 0, carrierId: '',
      requiredTreatments: TREATMENT.healing, completedTreatments: 0 });
    expect(state.players.get('red')?.carriedPatientId).toBe('');
    expect(patients.interact('blue', { targetId: 'waiting:0', expectedOccupantId: patient.id },
      { x: 130, y: 350 }, 'down').ok).toBe(true);
    expect(patients.interact('red', { targetId: 'waiting:0', expectedOccupantId: patient.id },
      { x: 130, y: 350 }, 'down').ok).toBe(false);
    expect(patient).toMatchObject({ location: 'carrier', carrierId: 'blue' });
    expect(() => patients.assertOwnership()).not.toThrow();
  });

  it('releases a disconnected carrier to waiting or recovery, then protects the recovery front', () => {
    const state = new RoomState();
    const patients = new RoomPatients(state);
    addPlayer(state, 'red');
    addPlayer(state, 'blue');
    const first = patients.admit('Pikachu', TREATMENT.healing, 0)!;
    patients.interact('red', { targetId: 'reception:0', expectedOccupantId: first.id },
      { x: 177, y: 194 }, 'up');
    patients.releaseCarrier('red');
    expect(first).toMatchObject({ location: 'waiting', slotIndex: 0, carrierId: '' });
    expect(state.players.get('red')?.carriedPatientId).toBe('');

    for (let index = 1; index < 4; index += 1) {
      const patient = patients.admit('Eevee', TREATMENT.healing, index)!;
      patients.interact('red', { targetId: `reception:${index}`, expectedOccupantId: patient.id },
        { x: [177, 369, 561, 753][index]!, y: 180 }, 'down');
      expect(patients.interact('red', { targetId: `waiting:${index}`, expectedOccupantId: '' },
        { x: [130, 184, 238, 292][index]!, y: 350 }, 'down').ok).toBe(true);
    }
    const fifth = patients.admit('Psyduck', TREATMENT.healing, 0)!;
    patients.interact('red', { targetId: 'reception:0', expectedOccupantId: fifth.id },
      { x: 177, y: 194 }, 'up');
    expect(patients.interact('red', { targetId: 'waiting:0', expectedOccupantId: '' },
      { x: 130, y: 350 }, 'down').reason).toBe('Slot is occupied');
    expect(state.players.get('red')?.carriedPatientId).toBe(fifth.id);
    patients.releaseCarrier('red');
    expect([...state.recoveryQueue]).toEqual([fifth.id]);
    expect(fifth).toMatchObject({ location: 'recovery', slotIndex: 0, carrierId: '' });
    const pickup = { targetId: 'recovery', expectedOccupantId: fifth.id };
    expect(patients.interact('blue', pickup, { x: 752, y: 350 }, 'down').ok).toBe(true);
    expect(patients.interact('red', pickup, { x: 752, y: 350 }, 'down').ok).toBe(false);
    expect([...state.recoveryQueue]).toEqual([]);
    expect(fifth).toMatchObject({ location: 'carrier', carrierId: 'blue' });
    expect(() => patients.assertOwnership()).not.toThrow();
  });

  it('orders simultaneous recovery entries by patient ID and keeps the front stable', () => {
    const state = new RoomState();
    const patients = new RoomPatients(state, () => 100);
    addPlayer(state, 'red');
    addPlayer(state, 'blue');
    for (let index = 0; index < 4; index += 1) {
      const patient = patients.admit('Pikachu', TREATMENT.healing, index)!;
      patients.interact('red', { targetId: `reception:${index}`, expectedOccupantId: patient.id },
        { x: [177, 369, 561, 753][index]!, y: 180 }, 'down');
      patients.interact('red', { targetId: `waiting:${index}`, expectedOccupantId: '' },
        { x: [130, 184, 238, 292][index]!, y: 350 }, 'down');
    }
    const fifth = patients.admit('Eevee', TREATMENT.healing, 0)!;
    const sixth = patients.admit('Psyduck', TREATMENT.healing, 1)!;
    patients.interact('red', { targetId: 'reception:0', expectedOccupantId: fifth.id },
      { x: 177, y: 180 }, 'down');
    patients.interact('blue', { targetId: 'reception:1', expectedOccupantId: sixth.id },
      { x: 369, y: 180 }, 'down');
    patients.releaseCarrier('blue');
    patients.releaseCarrier('red');
    expect([...state.recoveryQueue]).toEqual([fifth.id, sixth.id]);
    expect(fifth.slotIndex).toBe(0);
    expect(sixth.slotIndex).toBe(1);
    expect(patients.interact('blue', { targetId: 'recovery', expectedOccupantId: fifth.id },
      { x: 752, y: 350 }, 'down').ok).toBe(true);
    expect(patients.interact('red', { targetId: 'recovery', expectedOccupantId: fifth.id },
      { x: 752, y: 350 }, 'down').ok).toBe(false);
    expect([...state.recoveryQueue]).toEqual([sixth.id]);
    expect(sixth.slotIndex).toBe(0);
    expect(() => patients.assertOwnership()).not.toThrow();
  });

  it('heals once in the first machine and discharges a treated patient once', () => {
    const state = new RoomState();
    const patients = new RoomPatients(state);
    addPlayer(state, 'red');
    addPlayer(state, 'blue');
    const patient = patients.admit('Pikachu', TREATMENT.healing, 0)!;
    patients.interact('red', { targetId: 'reception:0', expectedOccupantId: patient.id },
      { x: 177, y: 180 }, 'down');
    expect(patients.interact('red', { targetId: 'discharge', expectedOccupantId: patient.id },
      { x: 840, y: 180 }, 'down').reason).toBe('Treatment still required');
    expect(state.players.get('red')?.carriedPatientId).toBe(patient.id);

    expect(patients.interact('red', { targetId: 'healing:0', expectedOccupantId: '' },
      { x: 280, y: 273 }, 'left').ok).toBe(true);
    expect(state.healingMachine).toMatchObject({ patientId: patient.id,
      status: 'treating', remainingMs: 4000 });
    expect(patient).toMatchObject({ location: 'healingMachine', slotIndex: 0, carrierId: '' });
    patients.advance(1000);
    expect(state.healingMachine.remainingMs).toBe(3000);
    expect(patients.interact('blue', { targetId: 'healing:0', expectedOccupantId: patient.id },
      { x: 280, y: 273 }, 'left').reason).toBe('Treatment in progress');
    patients.advance(3000);
    patients.advance(1000);
    expect(state.healingMachine).toMatchObject({ status: 'completed', remainingMs: 0 });
    expect(patient.completedTreatments).toBe(TREATMENT.healing);
    expect(patients.interact('blue', { targetId: 'healing:0', expectedOccupantId: patient.id },
      { x: 280, y: 273 }, 'left').ok).toBe(true);
    expect(state.healingMachine).toMatchObject({ patientId: '', status: 'empty', remainingMs: 0 });
    expect(state.players.get('blue')?.carriedPatientId).toBe(patient.id);
    expect(patients.interact('red', { targetId: 'healing:0', expectedOccupantId: patient.id },
      { x: 280, y: 273 }, 'left').ok).toBe(false);
    expect(patients.interact('blue', { targetId: 'discharge', expectedOccupantId: 'stale-id' },
      { x: 840, y: 180 }, 'down').reason).toBe('Carried patient changed');
    expect(state.players.get('blue')?.carriedPatientId).toBe(patient.id);
    expect(patients.interact('blue', { targetId: 'discharge', expectedOccupantId: patient.id },
      { x: 840, y: 180 }, 'down').ok).toBe(true);
    expect(patients.interact('blue', { targetId: 'discharge', expectedOccupantId: patient.id },
      { x: 840, y: 180 }, 'down').ok).toBe(false);
    expect(state.dischargedCount).toBe(1);
    expect(patient).toMatchObject({ lifecycle: 'discharged', location: 'none',
      slotIndex: -1, carrierId: '' });
    expect(state.players.get('blue')?.carriedPatientId).toBe('');
    expect(() => patients.assertOwnership()).not.toThrow();
  });

  it('rejects occupied machines and patients without pending healing', () => {
    const state = new RoomState();
    const patients = new RoomPatients(state);
    addPlayer(state, 'red');
    addPlayer(state, 'blue');
    const injured = patients.admit('Pikachu', TREATMENT.healing, 0)!;
    const burned = patients.admit('Eevee', TREATMENT.burnHeal, 1)!;
    patients.interact('red', { targetId: 'reception:0', expectedOccupantId: injured.id },
      { x: 177, y: 180 }, 'down');
    patients.interact('blue', { targetId: 'reception:1', expectedOccupantId: burned.id },
      { x: 369, y: 180 }, 'down');
    patients.interact('red', { targetId: 'healing:0', expectedOccupantId: '' },
      { x: 280, y: 273 }, 'left');
    expect(patients.interact('blue', { targetId: 'healing:0', expectedOccupantId: injured.id },
      { x: 280, y: 273 }, 'left').reason).toBe('Machine occupied');
    expect(state.players.get('blue')?.carriedPatientId).toBe(burned.id);
    patients.advance(4000);
    patients.interact('red', { targetId: 'healing:0', expectedOccupantId: injured.id },
      { x: 280, y: 273 }, 'left');
    expect(patients.interact('blue', { targetId: 'healing:0', expectedOccupantId: '' },
      { x: 280, y: 273 }, 'left').reason).toBe('Healing not needed');
    expect(state.healingMachine.status).toBe('empty');
    expect(burned).toMatchObject({ location: 'carrier', carrierId: 'blue' });
  });

  it('does not discharge an injured and burned patient after healing alone', () => {
    const state = new RoomState();
    const patients = new RoomPatients(state);
    addPlayer(state, 'red');
    const patient = patients.admit('Pikachu', TREATMENT.healing | TREATMENT.burnHeal, 0)!;
    patients.interact('red', { targetId: 'reception:0', expectedOccupantId: patient.id },
      { x: 177, y: 180 }, 'down');
    patients.interact('red', { targetId: 'healing:0', expectedOccupantId: '' },
      { x: 280, y: 273 }, 'left');
    patients.advance(4000);
    patients.interact('red', { targetId: 'healing:0', expectedOccupantId: patient.id },
      { x: 280, y: 273 }, 'left');
    expect(patient.completedTreatments).toBe(TREATMENT.healing);
    expect(patients.interact('red', { targetId: 'discharge', expectedOccupantId: patient.id },
      { x: 840, y: 180 }, 'down').reason).toBe('Treatment still required');
    expect(patient).toMatchObject({ lifecycle: 'active', location: 'carrier', carrierId: 'red' });
    expect(state.dischargedCount).toBe(0);
  });
});
