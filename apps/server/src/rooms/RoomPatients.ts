import { PATIENT_SPECIES, RECEPTION_SLOT_POSITIONS, TREATMENT,
  isValidTreatmentSet, type PatientSpecies } from '@pokecenter/shared';
import { PatientState, type RoomState } from './RoomState.js';

const PROTOTYPE_PATIENCE_MS = 90_000;

export class RoomPatients {
  private nextId = 1;

  constructor(private readonly state: RoomState) {
    for (let index = 0; index < RECEPTION_SLOT_POSITIONS.length; index += 1) {
      state.receptionSlots.push('');
    }
  }

  admit(species: PatientSpecies, requiredTreatments: number, slotIndex: number): PatientState | null {
    if (!PATIENT_SPECIES.includes(species) || !isValidTreatmentSet(requiredTreatments) ||
      !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= this.state.receptionSlots.length ||
      this.state.receptionSlots[slotIndex] !== '') return null;

    const patient = new PatientState();
    patient.id = `patient-${this.nextId++}`;
    patient.species = species;
    patient.requiredTreatments = requiredTreatments;
    patient.completedTreatments = 0;
    patient.initialPatienceMs = PROTOTYPE_PATIENCE_MS;
    patient.remainingPatienceMs = PROTOTYPE_PATIENCE_MS;
    patient.lifecycle = 'active';
    patient.location = 'reception';
    patient.slotIndex = slotIndex;
    patient.carrierId = '';
    this.state.patients.set(patient.id, patient);
    this.state.receptionSlots[slotIndex] = patient.id;
    return patient;
  }

  assertOwnership(): void {
    const seen = new Set<string>();
    for (let index = 0; index < this.state.receptionSlots.length; index += 1) {
      const id = this.state.receptionSlots[index];
      if (!id) continue;
      const patient = this.state.patients.get(id);
      if (!patient || patient.lifecycle !== 'active' || patient.location !== 'reception' ||
        patient.slotIndex !== index || patient.carrierId || seen.has(id)) {
        throw new Error(`Invalid reception owner at slot ${index}`);
      }
      seen.add(id);
    }
    for (const [id, patient] of this.state.patients) {
      if (patient.lifecycle === 'active' && patient.location === 'reception' && !seen.has(id)) {
        throw new Error(`Unowned reception patient ${id}`);
      }
    }
  }
}

export function seedPrototypePatient(patients: RoomPatients): void {
  if (!patients.admit('Pikachu', TREATMENT.healing, 0)) {
    throw new Error('Could not admit the prototype patient');
  }
}
