import { describe, expect, it } from 'vitest';
import { TREATMENT } from '@pokecenter/shared';
import { RoomPatients, seedPrototypePatient } from './RoomPatients.js';
import { RoomState } from './RoomState.js';

describe('RoomPatients', () => {
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
    expect(() => patients.assertOwnership()).toThrow('Unowned reception patient');
  });
});
