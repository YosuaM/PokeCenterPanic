import { describe, expect, it } from 'vitest';
import { MEDICINE_PREPARATION_MS } from '@pokecenter/shared';
import { RoomMedicine } from './RoomMedicine.js';
import { RoomMovement } from './RoomMovement.js';
import { MedicineDoseState, PlayerState, RoomState } from './RoomState.js';

const prepPosition = { x: 400, y: 350 };
const surfacePosition = { x: 390, y: 400 };
const disposalPosition = { x: 480, y: 350 };

function setup() {
  const state = new RoomState();
  const medicine = new RoomMedicine(state);
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
  return { state, medicine, prep, tick, surface };
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
});
