import { describe, expect, it } from 'vitest';
import { HEALING_INTERACTION_POINT, WAITING_INTERACTION_POINTS, TREATMENT } from '@pokecenter/shared';
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
  it.each([
    { index: 0, position: { x: 177, y: 208 } },
    { index: 1, position: { x: 369, y: 208 } },
    { index: 2, position: { x: 561, y: 208 } },
    { index: 3, position: { x: 690, y: 208 } },
  ])('claims reception patient $index from behind without requiring facing', ({ index, position }) => {
    for (const facing of ['up', 'down', 'left', 'right'] as const) {
      const state = new RoomState();
      const patients = new RoomPatients(state);
      addPlayer(state, 'red');
      addPlayer(state, 'blue');
      const patient = patients.admit('Pikachu', TREATMENT.healing, index)!;
      const request = { targetId: `reception:${index}`, expectedOccupantId: patient.id };
      expect(patients.interact('red', request, position, facing).ok).toBe(true);
      expect(patients.interact('blue', request, position, facing).ok).toBe(false);
      expect(state.players.get('red')!.carriedPatientId).toBe(patient.id);
      expect(state.players.get('blue')!.carriedPatientId).toBe('');
      expect(() => patients.assertOwnership()).not.toThrow();
    }
  });

  it.each(WAITING_INTERACTION_POINTS.map((point, index) => ({ point, index })))(
    'places and retrieves waiting patient $index from behind while looking away', ({ point, index }) => {
      const state = new RoomState();
      const patients = new RoomPatients(state);
      addPlayer(state, 'red');
      addPlayer(state, 'blue');
      const patient = patients.admit('Pikachu', TREATMENT.healing, 0)!;
      patients.interact('red', { targetId: 'reception:0', expectedOccupantId: patient.id },
        { x: 177, y: 354 }, 'down');
      const position = { x: point.x, y: 689 };
      const targetId = `waiting:${index}`;
      expect(patients.interact('red', { targetId, expectedOccupantId: '' }, position, 'down').ok).toBe(true);
      expect(patients.interact('blue', { targetId, expectedOccupantId: 'stale' }, position, 'left').ok).toBe(false);
      expect(state.waitingSlots[index]).toBe(patient.id);
      expect(patients.interact('blue', { targetId, expectedOccupantId: patient.id }, position, 'right').ok).toBe(true);
      expect(patients.interact('red', { targetId, expectedOccupantId: patient.id }, position, 'down').ok).toBe(false);
      expect(state.waitingSlots[index]).toBe('');
      expect(state.players.get('blue')!.carriedPatientId).toBe(patient.id);
      expect(() => patients.assertOwnership()).not.toThrow();
    });

  it.each([
    { x: 872, y: 113 }, { x: 960, y: 269 }, { x: 694, y: 185 }, { x: 1062, y: 185 },
  ])('exposes only the expected recovery front from adjacent position %j', (position) => {
    const state = new RoomState();
    const patients = new RoomPatients(state);
    addPlayer(state, 'red');
    addPlayer(state, 'blue');
    const patient = patients.admit('Pikachu', TREATMENT.healing, 0)!;
    state.receptionSlots[0] = '';
    patient.location = 'recovery';
    state.recoveryQueue.push(patient.id);
    const request = { targetId: 'recovery', expectedOccupantId: patient.id };
    expect(patients.interact('red', request, position, 'left').ok).toBe(true);
    expect(patients.interact('blue', request, position, 'right').ok).toBe(false);
    expect(state.recoveryQueue).toHaveLength(0);
    expect(() => patients.assertOwnership()).not.toThrow();
  });

  it.each([{ x: 840, y: 356 }, { x: 942, y: 282 }])(
    'discharges once from an adjacent counter position %j regardless of facing', (position) => {
      const state = new RoomState();
      const patients = new RoomPatients(state);
      addPlayer(state, 'red');
      const patient = patients.admit('Pikachu', TREATMENT.healing, 0)!;
      patient.completedTreatments = TREATMENT.healing;
      patients.interact('red', { targetId: 'reception:0', expectedOccupantId: patient.id },
        { x: 177, y: 354 }, 'down');
      const request = { targetId: 'discharge', expectedOccupantId: patient.id };
      expect(patients.interact('red', request, position, 'right').ok).toBe(true);
      expect(patients.interact('red', request, position, 'up').ok).toBe(false);
      expect(state.dischargedCount).toBe(1);
      expect(() => patients.assertOwnership()).not.toThrow();
    });

  it.each([
    { x: 40, y: -66 }, { x: 40, y: 131 },
    { x: -102, y: 33 }, { x: 181, y: 33 },
    { x: -102, y: -66 }, { x: 181, y: 131 },
  ])('places and claims a healing patient once from adjacent position %j', (position) => {
    const state = new RoomState();
    const patients = new RoomPatients(state);
    addPlayer(state, 'red');
    addPlayer(state, 'blue');
    const patient = patients.admit('Pikachu', TREATMENT.healing, 0)!;
    expect(patients.interact('red', { targetId: 'reception:0', expectedOccupantId: patient.id },
      { x: 177, y: 354 }, 'up').ok).toBe(true);
    const place = { targetId: 'healing:0', expectedOccupantId: '' };
    const pickup = { targetId: 'healing:0', expectedOccupantId: patient.id };
    expect(patients.interact('red', place, position, 'up').ok).toBe(true);
    expect(patients.interact('red', place, position, 'down').ok).toBe(false);
    expect(patients.interact('blue', pickup, position, 'left').reason).toBe('Treatment in progress');
    patients.advance(4000);
    expect(patients.interact('blue', pickup, position, 'right').ok).toBe(true);
    expect(patients.interact('red', pickup, position, 'down').ok).toBe(false);
    expect(state.players.get('red')!.carriedPatientId).toBe('');
    expect(state.players.get('blue')!.carriedPatientId).toBe(patient.id);
    expect(state.healingMachine).toMatchObject({ patientId: '', status: 'empty' });
    expect(() => patients.assertOwnership()).not.toThrow();
  });

  it.each([{ x: 40, y: 156 }, { x: 206, y: 33 }, { x: 40, y: 33 }])(
    'rejects machine placement outside adjacent walkable space %j without transferring ownership', (position) => {
      const state = new RoomState();
      const patients = new RoomPatients(state);
      addPlayer(state, 'red');
      const patient = patients.admit('Pikachu', TREATMENT.healing, 0)!;
      patients.interact('red', { targetId: 'reception:0', expectedOccupantId: patient.id },
        { x: 177, y: 354 }, 'up');
      expect(patients.interact('red', { targetId: 'healing:0', expectedOccupantId: '' },
        position, 'up').reason).toBe('Out of range or blocked');
      expect(state.players.get('red')!.carriedPatientId).toBe(patient.id);
      expect(state.healingMachine).toMatchObject({ patientId: '', status: 'empty' });
      expect(() => patients.assertOwnership()).not.toThrow();
    });

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
    expect(patients.interact('red', request, { x: 177, y: 354 }, 'up')).toEqual({ ok: true, reason: '' });
    expect(patients.interact('blue', request, { x: 177, y: 354 }, 'up'))
      .toEqual({ ok: false, reason: 'Patient already claimed or removed' });
    expect(patients.interact('red', request, { x: 177, y: 354 }, 'up').ok).toBe(false);
    expect(state.players.get('red')?.carriedPatientId).toBe(first.id);
    expect(state.players.get('blue')?.carriedPatientId).toBe('');
    expect(first).toMatchObject({ location: 'carrier', carrierId: 'red', slotIndex: -1 });
    expect(state.receptionSlots[0]).toBe('');
    expect(state.receptionSlots[1]).toBe(second.id);
    expect(() => patients.assertOwnership()).not.toThrow();
  });

  it('rejects forged, distant, and obstructed interactions without changing ownership', () => {
    const state = new RoomState();
    const patients = new RoomPatients(state);
    addPlayer(state, 'red');
    const patient = patients.admit('Pikachu', TREATMENT.healing, 0)!;
    const request = { targetId: 'reception:0', expectedOccupantId: patient.id };
    expect(patients.interact('red', request, { x: 177, y: 298 }, 'down').ok).toBe(false);
    expect(patients.interact('red', request, { x: 456, y: 422 }, 'up').ok).toBe(false);
    expect(patients.interact('red', { targetId: 'reception:9', expectedOccupantId: patient.id },
      { x: 177, y: 354 }, 'up').ok).toBe(false);
    expect(patients.interact('red', { targetId: 'reception:0', expectedOccupantId: 'other' },
      { x: 177, y: 354 }, 'up').ok).toBe(false);
    expect(patients.interact('red', { targetId: 'reception:0', expectedOccupantId: 4 },
      { x: 177, y: 354 }, 'up').ok).toBe(false);
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
      { x: 177, y: 354 }, 'up');
    expect(patients.interact('red', { targetId: 'waiting:0', expectedOccupantId: '' },
      { x: 130, y: 530 }, 'down').ok).toBe(true);
    expect(patient).toMatchObject({ location: 'waiting', slotIndex: 0, carrierId: '',
      requiredTreatments: TREATMENT.healing, completedTreatments: 0 });
    expect(state.players.get('red')?.carriedPatientId).toBe('');
    expect(patients.interact('blue', { targetId: 'waiting:0', expectedOccupantId: patient.id },
      { x: 130, y: 530 }, 'down').ok).toBe(true);
    expect(patients.interact('red', { targetId: 'waiting:0', expectedOccupantId: patient.id },
      { x: 130, y: 530 }, 'down').ok).toBe(false);
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
      { x: 177, y: 354 }, 'up');
    patients.releaseCarrier('red');
    expect(first).toMatchObject({ location: 'waiting', slotIndex: 0, carrierId: '' });
    expect(state.players.get('red')?.carriedPatientId).toBe('');

    for (let index = 1; index < WAITING_INTERACTION_POINTS.length; index += 1) {
      expect(patients.admit('Eevee', TREATMENT.healing, index, 'waiting')).not.toBeNull();
    }
    const fifth = patients.admit('Psyduck', TREATMENT.healing, 0)!;
    patients.interact('red', { targetId: 'reception:0', expectedOccupantId: fifth.id },
      { x: 177, y: 354 }, 'up');
    expect(patients.interact('red', { targetId: 'waiting:0', expectedOccupantId: '' },
      { x: 130, y: 530 }, 'down').reason).toBe('Slot is occupied');
    expect(state.players.get('red')?.carriedPatientId).toBe(fifth.id);
    patients.releaseCarrier('red');
    expect([...state.recoveryQueue]).toEqual([fifth.id]);
    expect(fifth).toMatchObject({ location: 'recovery', slotIndex: 0, carrierId: '' });
    const pickup = { targetId: 'recovery', expectedOccupantId: fifth.id };
    expect(patients.interact('blue', pickup, { x: 872, y: 110 }, 'down').ok).toBe(true);
    expect(patients.interact('red', pickup, { x: 872, y: 110 }, 'down').ok).toBe(false);
    expect([...state.recoveryQueue]).toEqual([]);
    expect(fifth).toMatchObject({ location: 'carrier', carrierId: 'blue' });
    expect(() => patients.assertOwnership()).not.toThrow();
  });

  it('orders simultaneous recovery entries by patient ID and keeps the front stable', () => {
    const state = new RoomState();
    const patients = new RoomPatients(state, () => 100);
    addPlayer(state, 'red');
    addPlayer(state, 'blue');
    for (let index = 0; index < WAITING_INTERACTION_POINTS.length; index += 1) {
      expect(patients.admit('Pikachu', TREATMENT.healing, index, 'waiting')).not.toBeNull();
    }
    const later = patients.admit('Eevee', TREATMENT.healing, 0)!;
    const earlier = patients.admit('Psyduck', TREATMENT.healing, 1)!;
    patients.interact('red', { targetId: 'reception:0', expectedOccupantId: later.id },
      { x: 177, y: 340 }, 'down');
    patients.interact('blue', { targetId: 'reception:1', expectedOccupantId: earlier.id },
      { x: 369, y: 340 }, 'down');
    patients.releaseCarrier('blue');
    patients.releaseCarrier('red');
    expect([...state.recoveryQueue]).toEqual([earlier.id, later.id]);
    expect(earlier.slotIndex).toBe(0);
    expect(later.slotIndex).toBe(1);
    expect(patients.interact('blue', { targetId: 'recovery', expectedOccupantId: earlier.id },
      { x: 872, y: 110 }, 'down').ok).toBe(true);
    expect(patients.interact('red', { targetId: 'recovery', expectedOccupantId: earlier.id },
      { x: 872, y: 110 }, 'down').ok).toBe(false);
    expect([...state.recoveryQueue]).toEqual([later.id]);
    expect(later.slotIndex).toBe(0);
    expect(() => patients.assertOwnership()).not.toThrow();
  });

  it('heals once in the first machine and discharges a treated patient once', () => {
    const state = new RoomState();
    const patients = new RoomPatients(state);
    addPlayer(state, 'red');
    addPlayer(state, 'blue');
    const patient = patients.admit('Pikachu', TREATMENT.healing, 0)!;
    patients.interact('red', { targetId: 'reception:0', expectedOccupantId: patient.id },
      { x: 177, y: 340 }, 'down');
    expect(patients.interact('red', { targetId: 'discharge', expectedOccupantId: patient.id },
      { x: 840, y: 340 }, 'down').reason).toBe('Treatment still required');
    expect(state.players.get('red')?.carriedPatientId).toBe(patient.id);

    expect(patients.interact('red', { targetId: 'healing:0', expectedOccupantId: '' },
      HEALING_INTERACTION_POINT, 'left').ok).toBe(true);
    expect(state.healingMachine).toMatchObject({ patientId: patient.id,
      status: 'treating', remainingMs: 4000 });
    expect(patient).toMatchObject({ location: 'healingMachine', slotIndex: 0, carrierId: '' });
    patients.advance(1000);
    expect(state.healingMachine.remainingMs).toBe(3000);
    expect(patients.interact('blue', { targetId: 'healing:0', expectedOccupantId: patient.id },
      HEALING_INTERACTION_POINT, 'left').reason).toBe('Treatment in progress');
    patients.advance(3000);
    patients.advance(1000);
    expect(state.healingMachine).toMatchObject({ status: 'completed', remainingMs: 0 });
    expect(patient.completedTreatments).toBe(TREATMENT.healing);
    expect(patients.interact('blue', { targetId: 'healing:0', expectedOccupantId: patient.id },
      HEALING_INTERACTION_POINT, 'left').ok).toBe(true);
    expect(state.healingMachine).toMatchObject({ patientId: '', status: 'empty', remainingMs: 0 });
    expect(state.players.get('blue')?.carriedPatientId).toBe(patient.id);
    expect(patients.interact('red', { targetId: 'healing:0', expectedOccupantId: patient.id },
      HEALING_INTERACTION_POINT, 'left').ok).toBe(false);
    expect(patients.interact('blue', { targetId: 'discharge', expectedOccupantId: 'stale-id' },
      { x: 840, y: 340 }, 'down').reason).toBe('Carried patient changed');
    expect(state.players.get('blue')?.carriedPatientId).toBe(patient.id);
    expect(patients.interact('blue', { targetId: 'discharge', expectedOccupantId: patient.id },
      { x: 840, y: 340 }, 'down').ok).toBe(true);
    expect(patients.interact('blue', { targetId: 'discharge', expectedOccupantId: patient.id },
      { x: 840, y: 340 }, 'down').ok).toBe(false);
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
      { x: 177, y: 340 }, 'down');
    patients.interact('blue', { targetId: 'reception:1', expectedOccupantId: burned.id },
      { x: 369, y: 340 }, 'down');
    patients.interact('red', { targetId: 'healing:0', expectedOccupantId: '' },
      HEALING_INTERACTION_POINT, 'left');
    expect(patients.interact('blue', { targetId: 'healing:0', expectedOccupantId: injured.id },
      HEALING_INTERACTION_POINT, 'left').reason).toBe('Machine occupied');
    expect(state.players.get('blue')?.carriedPatientId).toBe(burned.id);
    patients.advance(4000);
    patients.interact('red', { targetId: 'healing:0', expectedOccupantId: injured.id },
      HEALING_INTERACTION_POINT, 'left');
    expect(patients.interact('blue', { targetId: 'healing:0', expectedOccupantId: '' },
      HEALING_INTERACTION_POINT, 'left').reason).toBe('Healing not needed');
    expect(state.healingMachine.status).toBe('empty');
    expect(burned).toMatchObject({ location: 'carrier', carrierId: 'blue' });
  });

  it('does not discharge an injured and burned patient after healing alone', () => {
    const state = new RoomState();
    const patients = new RoomPatients(state);
    addPlayer(state, 'red');
    const patient = patients.admit('Pikachu', TREATMENT.healing | TREATMENT.burnHeal, 0)!;
    patients.interact('red', { targetId: 'reception:0', expectedOccupantId: patient.id },
      { x: 177, y: 340 }, 'down');
    patients.interact('red', { targetId: 'healing:0', expectedOccupantId: '' },
      HEALING_INTERACTION_POINT, 'left');
    patients.advance(4000);
    patients.interact('red', { targetId: 'healing:0', expectedOccupantId: patient.id },
      HEALING_INTERACTION_POINT, 'left');
    expect(patient.completedTreatments).toBe(TREATMENT.healing);
    expect(patients.interact('red', { targetId: 'discharge', expectedOccupantId: patient.id },
      { x: 840, y: 340 }, 'down').reason).toBe('Treatment still required');
    expect(patient).toMatchObject({ lifecycle: 'active', location: 'carrier', carrierId: 'red' });
    expect(state.dischargedCount).toBe(0);
  });
});

 it.each([4, 5, 6, 7])('supports placement and competing pickups in expanded waiting seat %s', (slotIndex) => {
  const state = new RoomState();
  const patients = new RoomPatients(state);
  addPlayer(state, 'red');
  addPlayer(state, 'blue');
  const patient = patients.admit('Pikachu', TREATMENT.healing, 0)!;
  patients.interact('red', { targetId: 'reception:0', expectedOccupantId: patient.id },
    { x: 177, y: 344 }, 'up');
  const point = WAITING_INTERACTION_POINTS[slotIndex]!;
  const targetId = `waiting:${slotIndex}`;
  expect(patients.interact('red', { targetId, expectedOccupantId: '' }, point, 'down').ok).toBe(true);
  expect(state.waitingSlots[slotIndex]).toBe(patient.id);
  expect(patients.interact('red', { targetId, expectedOccupantId: patient.id }, { x: point.x, y: point.y - 100 }, 'up').ok).toBe(false);
  expect(patients.interact('blue', { targetId, expectedOccupantId: patient.id }, point, 'down').ok).toBe(true);
  expect(patients.interact('red', { targetId, expectedOccupantId: patient.id }, point, 'down').ok).toBe(false);
  expect(state.waitingSlots[slotIndex]).toBe('');
  expect(() => patients.assertOwnership()).not.toThrow();
});

it.each(['waiting:8', 'waiting:-1', 'waiting:07', 'waiting:7.5', 'waiting:1e0',
  'waiting:999999999999999999999', 'reception:4'])('rejects invalid slot target %s', (targetId) => {
  const state = new RoomState();
  const patients = new RoomPatients(state);
  addPlayer(state, 'red');
  expect(patients.interact('red', { targetId, expectedOccupantId: '' },
    WAITING_INTERACTION_POINTS[7]!, 'down')).toMatchObject({ ok: false, reason: 'Unknown target' });
  expect(() => patients.assertOwnership()).not.toThrow();
});
