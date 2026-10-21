import { describe, expect, it } from 'vitest';
import { MEDICINE_PREPARATION_MS, TREATMENT } from '@pokecenter/shared';
import { RoomMedicine } from './RoomMedicine.js';
import { RoomMovement } from './RoomMovement.js';
import { RoomPatients } from './RoomPatients.js';
import { MedicineDoseState, PlayerState, RoomState } from './RoomState.js';

const prepPosition = { x: 400, y: 350 };
const surfacePosition = { x: 390, y: 400 };
const disposalPosition = { x: 480, y: 350 };

function setup() {
  const state = new RoomState();
  const medicine = new RoomMedicine(state);
  const patients = new RoomPatients(state);
  for (const id of ['red', 'blue']) {
    const player = new PlayerState();
    player.name = id;
    player.carriedPatientId = '';
    player.carriedMedicineId = '';
    player.connected = true;
    state.players.set(id, player);
  }
  const prep = (id = 'red', now = 0, index = 0) => medicine.interact(id,
    { targetId: `medicine:prep:${index}`, expectedOccupantId: '', sequence: 1, roundId: 'round' },
    index === 0 ? prepPosition : { x: 560, y: 350 }, 'up', now, true);
  const tick = (now: number, id = 'red', index = 0) => {
    medicine.onInput(id, true, null, now);
    medicine.advance(now, (playerId) => playerId === 'blue' || index === 1 ?
      { x: 560, y: 350 } : prepPosition, () => 'up');
  };
  const surface = (id: string, index: number, expectedOccupantId = '') => medicine.interact(id,
    { targetId: `medicine:surface:${index}`, expectedOccupantId, sequence: 1, roundId: 'round' },
    { x: 390 + index * 60, y: 400 }, 'up', 0, true);
  return { state, medicine, patients, prep, tick, surface };
}

function giveDose(state: RoomState, kind: 'burnHeal' | 'antidote', id = 'test-dose'): void {
  const dose = new MedicineDoseState();
  dose.id = id;
  dose.kind = kind;
  dose.location = 'carrier';
  dose.carrierId = 'red';
  dose.slotIndex = -1;
  state.medicineDoses.set(id, dose);
  state.players.get('red')!.carriedMedicineId = id;
}

function apply(medicine: RoomMedicine, targetId: string, patientId: string,
  position: { x: number; y: number }, facing: 'up' | 'down' | 'left' = 'up') {
  return medicine.interact('red', { targetId: `medicine:apply:${targetId}`,
    expectedOccupantId: patientId, sequence: 1, roundId: 'round' }, position, facing, 0, true);
}

describe('RoomMedicine', () => {
  it('creates one carried dose only after a fresh uninterrupted two-second hold', () => {
    const { state, medicine, prep, tick } = setup();
    expect(prep().ok).toBe(true);
    expect(state.medicinePreparationOwners[0]).toBe('red');
    for (let now = 100; now < MEDICINE_PREPARATION_MS; now += 100) tick(now);
    expect(state.medicineDoses.size).toBe(0);
    tick(MEDICINE_PREPARATION_MS);
    expect(state.medicineDoses.size).toBe(1);
    expect(state.players.get('red')?.carriedMedicineId).toBe('dose-1');
    expect(state.medicineDoses.get('dose-1')).toMatchObject({ kind: 'burnHeal',
      location: 'carrier', carrierId: 'red', slotIndex: -1 });
    expect(state.medicinePreparationOwners[0]).toBe('');
    expect(prep().ok).toBe(false);
    tick(2_100);
    expect(state.medicineDoses.size).toBe(1);
    expect(() => medicine.assertOwnership()).not.toThrow();
  });

  it('prepares Antidote at the second point', () => {
    const { state, prep, tick } = setup();
    expect(prep('red', 0, 1).ok).toBe(true);
    for (let now = 100; now <= 2_000; now += 100) tick(now, 'red', 1);
    expect(state.medicineDoses.get('dose-1')?.kind).toBe('antidote');
  });

  it('cancels on release, movement, stale input, range loss, or disconnect without creating a dose', () => {
    for (const cancel of ['release', 'move', 'stale', 'range', 'disconnect']) {
      const { state, medicine, prep, tick } = setup();
      expect(prep().ok).toBe(true);
      tick(100);
      if (cancel === 'release') medicine.onInput('red', false, null, 150);
      if (cancel === 'move') medicine.onInput('red', true, 'right', 150);
      if (cancel === 'stale') medicine.advance(350, () => prepPosition, () => 'up');
      if (cancel === 'range') medicine.advance(150, () => surfacePosition, () => 'up');
      if (cancel === 'disconnect') medicine.releaseCarrier('red');
      medicine.advance(2_100, () => prepPosition, () => 'up');
      expect(state.medicineDoses.size, cancel).toBe(0);
      expect(state.medicinePreparationOwners[0], cancel).toBe('');
      expect(state.medicinePreparationRemainingMs[0], cancel).toBe(0);
    }
  });

  it('locks each preparation point and requires empty hands and a release before reuse', () => {
    const { state, medicine, prep, tick } = setup();
    expect(prep().ok).toBe(true);
    expect(prep('blue').reason).toBe('Preparation point occupied');
    expect(prep('blue', 0, 1).ok).toBe(true);
    expect(state.medicinePreparationOwners[1]).toBe('blue');
    medicine.onInput('red', false, null, 100);
    expect(prep().ok).toBe(true);
    for (let now = 200; now <= 2_100; now += 100) tick(now);
    medicine.onInput('red', false, null, 2_150);
    expect(prep().reason).toBe('Hands must be empty');
    state.players.get('red')!.carriedPatientId = 'patient-1';
    expect(prep().reason).toBe('Hands must be empty');
    state.players.get('red')!.carriedPatientId = '';
  });

  it('moves a dose between exactly one carrier and one surface and rejects conflicts', () => {
    const { state, medicine, prep, tick, surface } = setup();
    prep();
    for (let now = 100; now <= 2_000; now += 100) tick(now);
    medicine.onInput('red', false, null, 2_050);
    expect(surface('red', 0).ok).toBe(true);
    expect(state.medicineSurfaces[0]).toBe('dose-1');
    expect(state.players.get('red')?.carriedMedicineId).toBe('');
    const second = new MedicineDoseState();
    second.id = 'dose-2';
    second.kind = 'antidote';
    second.location = 'carrier';
    second.carrierId = 'red';
    second.slotIndex = -1;
    state.medicineDoses.set(second.id, second);
    state.players.get('red')!.carriedMedicineId = second.id;
    medicine.onInput('red', false, null, 2_060);
    expect(surface('red', 0, 'dose-1').reason).toBe('Medicine surface occupied');
    expect(state.players.get('red')?.carriedMedicineId).toBe(second.id);
    expect(surface('blue', 0).reason).toBe('Medicine surface changed');
    expect(surface('blue', 0, 'dose-1').ok).toBe(true);
    expect(state.players.get('blue')?.carriedMedicineId).toBe('dose-1');
    medicine.onInput('red', false, null, 2_075);
    expect(surface('red', 0, 'dose-1').reason).toBe('Medicine surface changed');
    expect(surface('blue', 0).reason).toBe('Release E before interacting again');
    medicine.onInput('blue', false, null, 2_100);
    expect(surface('blue', 0).ok).toBe(true);
    expect(() => medicine.assertOwnership()).not.toThrow();
  });

  it('discards carried medicine and transfers or discards it on disconnect', () => {
    const { state, medicine, prep, tick, surface } = setup();
    prep();
    for (let now = 100; now <= 2_000; now += 100) tick(now);
    medicine.releaseCarrier('red');
    expect(state.medicineSurfaces[0]).toBe('dose-1');
    expect(state.players.get('red')?.carriedMedicineId).toBe('');
    expect(surface('blue', 0, 'dose-1').ok).toBe(true);
    medicine.onInput('blue', false, null, 2_050);
    expect(medicine.interact('blue', { targetId: 'medicine:disposal', expectedOccupantId: 'dose-1',
      sequence: 2, roundId: 'round' }, disposalPosition, 'up', 2_100, true).ok).toBe(true);
    expect(state.medicineDoses.size).toBe(0);
    expect(state.medicineSurfaces[0]).toBe('');
    expect(() => medicine.assertOwnership()).not.toThrow();
  });

  it('discards a disconnected carrier dose when all four surfaces are full', () => {
    const { state, medicine } = setup();
    for (let index = 0; index < 4; index += 1) {
      const dose = new MedicineDoseState();
      dose.id = `stored-${index}`;
      dose.kind = 'antidote';
      dose.location = 'surface';
      dose.carrierId = '';
      dose.slotIndex = index;
      state.medicineDoses.set(dose.id, dose);
      state.medicineSurfaces[index] = dose.id;
    }
    const carried = new MedicineDoseState();
    carried.id = 'carried';
    carried.kind = 'burnHeal';
    carried.location = 'carrier';
    carried.carrierId = 'red';
    carried.slotIndex = -1;
    state.medicineDoses.set(carried.id, carried);
    state.players.get('red')!.carriedMedicineId = carried.id;
    medicine.assertOwnership();
    medicine.releaseCarrier('red');
    expect(state.medicineDoses.has('carried')).toBe(false);
    expect([...state.medicineSurfaces]).toEqual(['stored-0', 'stored-1', 'stored-2', 'stored-3']);
    expect(state.players.get('red')?.carriedMedicineId).toBe('');
    expect(() => medicine.assertOwnership()).not.toThrow();
    medicine.reset();
    expect(state.medicineDoses.size).toBe(0);
    expect([...state.medicineSurfaces]).toEqual(['', '', '', '']);
  });

  it('rejects unreachable or forged targets and stale action sequences', () => {
    const { state, medicine, prep } = setup();
    expect(medicine.interact('red', { targetId: 'medicine:prep:0', expectedOccupantId: '',
      sequence: 1, roundId: 'round' }, { x: 456, y: 422 }, 'up', 0, true).ok).toBe(false);
    expect(medicine.interact('red', { targetId: 'medicine:prep:9', expectedOccupantId: '',
      sequence: 1, roundId: 'round' }, prepPosition, 'up', 0, true).ok).toBe(false);
    expect(prep().ok).toBe(true);
    expect(state.medicineDoses.size).toBe(0);
    const movement = new RoomMovement();
    movement.add('red');
    expect(movement.acceptAction('red', 3, 'round', 'round')).toBe(true);
    expect(movement.acceptAction('red', 3, 'round', 'round')).toBe(false);
    expect(movement.acceptAction('red', 4, 'old', 'round')).toBe(false);
    expect(movement.accept('red', { direction: null, interactHeld: true, sequence: 4,
      roundId: 'round' }, 100, 'round')).toBe(true);
    expect(movement.acceptAction('red', 4, 'round', 'round')).toBe(false);
  });

  it('applies matching medicine once at reception, waiting, recovery front, and completed healing', () => {
    const cases = [
      { target: 'reception:0', position: { x: 177, y: 194 }, facing: 'up' as const,
        location: 'reception' as const },
      { target: 'waiting:0', position: { x: 130, y: 350 }, facing: 'down' as const,
        location: 'waiting' as const },
      { target: 'recovery', position: { x: 752, y: 350 }, facing: 'down' as const,
        location: 'recovery' as const },
      { target: 'healing:0', position: { x: 280, y: 273 }, facing: 'left' as const,
        location: 'healingMachine' as const },
    ];
    for (const { target, position, facing, location } of cases) {
      const { state, medicine, patients } = setup();
      const patient = patients.admit('Pikachu', TREATMENT.healing | TREATMENT.burnHeal, 0)!;
      state.receptionSlots[0] = '';
      patient.location = location;
      patient.slotIndex = 0;
      if (location === 'reception') state.receptionSlots[0] = patient.id;
      if (location === 'waiting') state.waitingSlots[0] = patient.id;
      if (location === 'recovery') state.recoveryQueue.push(patient.id);
      if (location === 'healingMachine') {
        state.healingMachine.patientId = patient.id;
        state.healingMachine.status = 'completed';
        patient.completedTreatments = TREATMENT.healing;
      }
      patients.assertOwnership();
      giveDose(state, 'burnHeal');
      expect(apply(medicine, target, patient.id, position, facing).ok, target).toBe(true);
      expect(patient.completedTreatments & TREATMENT.burnHeal, target).toBe(TREATMENT.burnHeal);
      expect(state.medicineDoses.size, target).toBe(0);
      expect(state.players.get('red')?.carriedMedicineId, target).toBe('');
      medicine.onInput('red', false, null, 50);
      expect(apply(medicine, target, patient.id, position, facing).ok, target).toBe(false);
      expect(() => medicine.assertOwnership()).not.toThrow();
      patients.assertOwnership();
    }
  });

  it('keeps the dose and patient unchanged for wrong, redundant, carried, or unavailable targets', () => {
    const { state, medicine, patients } = setup();
    const patient = patients.admit('Pikachu', TREATMENT.healing | TREATMENT.burnHeal, 0)!;
    giveDose(state, 'antidote');
    const reception = { x: 177, y: 194 };
    expect(apply(medicine, 'reception:0', patient.id, reception).reason).toBe('Wrong medicine');
    expect(state.players.get('red')?.carriedMedicineId).toBe('test-dose');
    expect(patient.completedTreatments).toBe(0);
    state.medicineDoses.get('test-dose')!.kind = 'burnHeal';
    patient.completedTreatments = TREATMENT.burnHeal;
    expect(apply(medicine, 'reception:0', patient.id, reception).reason).toBe('Treatment already complete');
    patient.completedTreatments = 0;
    state.receptionSlots[0] = '';
    patient.location = 'carrier';
    patient.slotIndex = -1;
    patient.carrierId = 'blue';
    state.players.get('blue')!.carriedPatientId = patient.id;
    expect(apply(medicine, 'reception:0', patient.id, reception).reason).toBe('Patient changed or removed');
    state.players.get('blue')!.carriedPatientId = '';
    patient.carrierId = '';
    patient.location = 'healingMachine';
    patient.slotIndex = 0;
    state.healingMachine.patientId = patient.id;
    for (const status of ['treating', 'broken']) {
      state.healingMachine.status = status;
      expect(apply(medicine, 'healing:0', patient.id, { x: 280, y: 273 }, 'left').reason)
        .toBe('Healing machine unavailable');
    }
    expect(state.medicineDoses.has('test-dose')).toBe(true);
    expect(state.players.get('red')?.carriedMedicineId).toBe('test-dose');
    expect(patient.completedTreatments).toBe(0);
  });

  it('lets one player complete injury and burn care in either order', () => {
    for (const medicineFirst of [true, false]) {
      const { state, medicine, patients } = setup();
      const patient = patients.admit('Pikachu', TREATMENT.healing | TREATMENT.burnHeal, 0)!;
      expect(patients.interact('red', { targetId: 'reception:0', expectedOccupantId: patient.id },
        { x: 177, y: 194 }, 'up').ok).toBe(true);
      if (medicineFirst) {
        expect(patients.interact('red', { targetId: 'waiting:0', expectedOccupantId: '' },
          { x: 130, y: 350 }, 'down').ok).toBe(true);
        giveDose(state, 'burnHeal');
        expect(apply(medicine, 'waiting:0', patient.id, { x: 130, y: 350 }, 'down').ok).toBe(true);
        medicine.onInput('red', false, null, 50);
        expect(patients.interact('red', { targetId: 'waiting:0', expectedOccupantId: patient.id },
          { x: 130, y: 350 }, 'down').ok).toBe(true);
      }
      expect(patients.interact('red', { targetId: 'healing:0', expectedOccupantId: '' },
        { x: 280, y: 273 }, 'left').ok).toBe(true);
      patients.advance(4_000);
      if (!medicineFirst) {
        giveDose(state, 'burnHeal');
        expect(apply(medicine, 'healing:0', patient.id, { x: 280, y: 273 }, 'left').ok).toBe(true);
        medicine.onInput('red', false, null, 50);
      }
      expect(patients.interact('red', { targetId: 'healing:0', expectedOccupantId: patient.id },
        { x: 280, y: 273 }, 'left').ok).toBe(true);
      expect(patients.interact('red', { targetId: 'discharge', expectedOccupantId: patient.id },
        { x: 840, y: 180 }, 'down').ok).toBe(true);
      expect(state.dischargedCount).toBe(1);
      expect(patient.completedTreatments).toBe(TREATMENT.healing | TREATMENT.burnHeal);
      expect(state.medicineDoses.size).toBe(0);
      expect(() => medicine.assertOwnership()).not.toThrow();
    }
  });

  it('applies Antidote once and preserves a competing player’s dose', () => {
    const { state, medicine, patients } = setup();
    const patient = patients.admit('Psyduck', TREATMENT.antidote, 0)!;
    giveDose(state, 'antidote');
    const competing = new MedicineDoseState();
    competing.id = 'blue-dose';
    competing.kind = 'antidote';
    competing.location = 'carrier';
    competing.carrierId = 'blue';
    competing.slotIndex = -1;
    state.medicineDoses.set(competing.id, competing);
    state.players.get('blue')!.carriedMedicineId = competing.id;
    expect(apply(medicine, 'reception:0', patient.id, { x: 177, y: 194 }).ok).toBe(true);
    expect(medicine.interact('blue', { targetId: 'medicine:apply:reception:0',
      expectedOccupantId: patient.id, sequence: 2, roundId: 'round' },
    { x: 177, y: 194 }, 'up', 100, true).reason).toBe('Treatment already complete');
    expect(patient.completedTreatments).toBe(TREATMENT.antidote);
    expect(state.medicineDoses.size).toBe(1);
    expect(state.players.get('blue')?.carriedMedicineId).toBe(competing.id);
    expect(() => medicine.assertOwnership()).not.toThrow();
  });
});
