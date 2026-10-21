import { TREATMENT, type HealingMachineSnapshot, type PatientInteractionResult,
  type PatientRecord, type PlayerPosition, type PlayerPresence } from '@pokecenter/shared';

export interface VisualFixture {
  players: PlayerPresence[];
  positions: PlayerPosition[];
  patients: PatientRecord[];
  machine: HealingMachineSnapshot;
  medicineOwners: string[];
  medicineRemainingMs: number[];
  result?: PatientInteractionResult;
}

const staff = { id: 'fixture-staff', name: 'Staff', slot: 0, character: 'Chansey' } as const;

function patient(species: PatientRecord['species'], requiredTreatments: number,
  completedTreatments = 0): PatientRecord {
  return { id: 'fixture-patient', species, requiredTreatments, completedTreatments,
    initialPatienceMs: 90_000, remainingPatienceMs: 45_000, lifecycle: 'active',
    location: 'reception', slotIndex: 0, carrierId: '' };
}

export function visualFixture(name: string | null): VisualFixture | null {
  if (!name) return null;
  const fixture: VisualFixture = {
    players: [staff],
    positions: [{ id: staff.id, x: 177, y: 194, facing: 'up', carriedPatientId: '' }],
    patients: [patient('Pikachu', TREATMENT.healing)],
    machine: { patientId: '', status: 'empty', remainingMs: 0 },
    medicineOwners: ['', ''], medicineRemainingMs: [0, 0],
  };
  switch (name) {
    case 'heal': break;
    case 'burn': fixture.patients = [patient('Charmander', TREATMENT.burnHeal)]; break;
    case 'poison': fixture.patients = [patient('Bulbasaur', TREATMENT.antidote)]; break;
    case 'ready': fixture.patients = [patient('Squirtle', TREATMENT.healing | TREATMENT.antidote,
      TREATMENT.healing | TREATMENT.antidote)]; break;
    case 'rejected': fixture.result = { ok: false, reason: 'Patient already claimed or removed' }; break;
    case 'healing':
    case 'outage':
    case 'repair':
      fixture.positions = [{ id: staff.id, x: 280, y: 273, facing: 'left', carriedPatientId: '' }];
      fixture.patients[0] = { ...fixture.patients[0]!, location: 'healingMachine', slotIndex: 0 };
      fixture.machine = { patientId: 'fixture-patient',
        status: name === 'healing' ? 'treating' : 'broken', remainingMs: 3_000,
        ...(name === 'repair' ? { repairOwnerId: staff.id, repairRemainingMs: 1_000 } : {}) };
      break;
    case 'preparing':
      fixture.positions = [{ id: staff.id, x: 400, y: 350, facing: 'up', carriedPatientId: '' }];
      fixture.medicineOwners = [staff.id, ''];
      fixture.medicineRemainingMs = [1_000, 0];
      break;
    case 'roster':
      fixture.players = [staff, { id: 'fixture-2', name: 'Blue', slot: 1, character: 'Chansey' },
        { id: 'fixture-3', name: 'Green', slot: 2, character: 'Audino' },
        { id: 'fixture-4', name: 'Gold', slot: 3, character: 'Meowth' }];
      fixture.positions = fixture.players.map((player, index) => ({ id: player.id,
        x: 340 + index * 80, y: 422, facing: 'up' as const, carriedPatientId: '' }));
      fixture.patients = (['Pikachu', 'Bulbasaur', 'Charmander', 'Squirtle', 'Eevee', 'Psyduck'] as const)
        .map((species, index) => ({ ...patient(species, TREATMENT.healing),
          id: `fixture-${index}`, location: index < 4 ? 'reception' as const : 'waiting' as const,
          slotIndex: index < 4 ? index : index - 4 }));
      break;
    default: return null;
  }
  return fixture;
}
