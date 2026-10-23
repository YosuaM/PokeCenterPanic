import { PATIENT_SPECIES, WAITING_SLOT_POSITIONS, WAITING_INTERACTION_POINTS, RECEPTION_CHECK_IN_POINT, WALK_BOUNDS, RECEPTION_INTERACTION_POINTS, MEDICINE_PREPARATION_POINTS, SPAWN_POINTS, MEDICINE_DISPOSAL_POINT, RECOVERY_INTERACTION_POINT, HEALING_INTERACTION_POINT, TREATMENT, type HealingMachineSnapshot, type PatientInteractionResult,
  type MedicineDiscardEvent, type MedicineDoseRecord, type PatientRecord, type PlayerPosition, type PlayerPresence } from '@pokecenter/shared';

export interface VisualFixture {
  players: PlayerPresence[];
  positions: PlayerPosition[];
  patients: PatientRecord[];
  machine: HealingMachineSnapshot;
  medicineDoses?: MedicineDoseRecord[];
  medicineOwners: string[];
  medicineRemainingMs: number[];
  result?: PatientInteractionResult;
  discardAtTime?: (timeMs: number) => MedicineDiscardEvent;
  positionsAtTime?: (timeMs: number) => PlayerPosition[];
  patientsAtTime?: (timeMs: number) => PatientRecord[];
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
    positions: [{ id: staff.id, ...RECEPTION_INTERACTION_POINTS[0]!, y: RECEPTION_INTERACTION_POINTS[0]!.y + 10, facing: 'up', carriedPatientId: '' }],
    patients: [patient('Pikachu', TREATMENT.healing)],
    machine: { patientId: '', status: 'empty', remainingMs: 0 },
    medicineOwners: ['', ''], medicineRemainingMs: [0, 0],
  };
  switch (name) {
    case 'entrance-proximity':
      fixture.positionsAtTime = entrancePreviewPositions;
      fixture.positions = entrancePreviewPositions(0);
      fixture.patients = [];
      break;
    case 'entrance-door':
      fixture.players = [staff, { id: 'fixture-2', name: 'Audino', slot: 1, character: 'Audino' },
        { id: 'fixture-3', name: 'Meowth', slot: 2, character: 'Meowth' },
        { id: 'fixture-4', name: 'Machoke', slot: 3, character: 'Machoke' }];
      fixture.positions = fixture.players.map((player, index) => ({ id: player.id,
        ...SPAWN_POINTS[index]!, facing: 'down', carriedPatientId: '' }));
      fixture.patients = [];
      break;
    case 'heal': break;
    case 'burn': fixture.patients = [patient('Charmander', TREATMENT.burnHeal)]; break;
    case 'poison': fixture.patients = [patient('Bulbasaur', TREATMENT.antidote)]; break;
    case 'ready': fixture.patients = [patient('Squirtle', TREATMENT.healing | TREATMENT.antidote,
      TREATMENT.healing | TREATMENT.antidote)]; break;
    case 'reception-lights':
      fixture.positions = [{ id: staff.id, x: 480, y: 375, facing: 'up', carriedPatientId: '' }];
      fixture.patients = [patient('Pikachu', TREATMENT.healing),
        { ...patient('Squirtle', TREATMENT.healing | TREATMENT.antidote,
          TREATMENT.healing | TREATMENT.antidote), id: 'fixture-ready', slotIndex: 2 }];
      break;
    case 'rejected': fixture.result = { ok: false, reason: 'Patient already claimed or removed' }; break;
    case 'healing':
    case 'healed':
    case 'outage':
    case 'repair':
      fixture.positions = [{ id: staff.id, ...HEALING_INTERACTION_POINT,
        facing: 'left', carriedPatientId: '' }];
      fixture.patients[0] = { ...fixture.patients[0]!, location: 'healingMachine', slotIndex: 0 };
      fixture.machine = { patientId: 'fixture-patient',
        status: name === 'healing' ? 'treating' : name === 'healed' ? 'completed' : 'broken',
        remainingMs: name === 'healed' ? 0 : 3_000,
        ...(name === 'repair' ? { repairOwnerId: staff.id, repairRemainingMs: 1_000 } : {}) };
      if (name === 'healed') fixture.patients[0].completedTreatments = TREATMENT.healing;
      break;
    case 'preparing':
    case 'preparing-antidote':
    case 'preparing-both':
      fixture.positions = [{ id: staff.id, x: 400, y: MEDICINE_PREPARATION_POINTS[0]!.y + 28, facing: 'up', carriedPatientId: '' }];
      fixture.medicineOwners = [staff.id, ''];
      fixture.medicineRemainingMs = [1_000, 0];
      if (name === 'preparing-antidote') {
        fixture.positions[0]!.x = 560;
        fixture.medicineOwners = ['', staff.id];
        fixture.medicineRemainingMs = [0, 1_000];
      } else if (name === 'preparing-both') {
        fixture.players.push({ id: 'fixture-2', name: 'Antidote', slot: 1, character: 'Audino' });
        fixture.positions.push({ id: 'fixture-2', x: 560, y: MEDICINE_PREPARATION_POINTS[1]!.y + 28,
          facing: 'up', carriedPatientId: '' });
        fixture.medicineOwners[1] = 'fixture-2';
        fixture.medicineRemainingMs[1] = 1_000;
      }
      break;
    case 'medicine-disposal-fx':
    case 'medicine-disposal':
      fixture.positions = [{ id: staff.id, x: MEDICINE_DISPOSAL_POINT.x,
        y: MEDICINE_DISPOSAL_POINT.y + 28, facing: 'up', carriedPatientId: '',
        carriedMedicineId: 'discard-dose' }];
      fixture.patients = [];
      fixture.medicineDoses = [{ id: 'discard-dose', kind: 'burnHeal', location: 'carrier',
        carrierId: staff.id, slotIndex: -1 }];
      if (name === 'medicine-disposal-fx') {
        fixture.medicineDoses = [];
        fixture.positions[0]!.carriedMedicineId = '';
        fixture.positions[0]!.x -= 60;
        fixture.discardAtTime = (timeMs) => {
          const cycle = Math.floor(timeMs / 2400);
          return { roundId: 'preview', doseId: `discard-${cycle}`,
            kind: cycle % 2 === 0 ? 'burnHeal' : 'antidote' };
        };
      }
      break;
    case 'medicine-shelf':
      fixture.positions = [{ id: staff.id, x: 400, y: 70, facing: 'up', carriedPatientId: '' }];
      fixture.patients = [];
      fixture.medicineDoses = [0, 1, 2, 3, 4].map((slotIndex) => ({ id: `shelf-${slotIndex}`,
        kind: slotIndex < 3 ? 'burnHeal' as const : 'antidote' as const, location: 'stock' as const, carrierId: '', slotIndex }));
      break;
    case 'medicine-sway':
    case 'medicine-bottles':
      fixture.players.push({ id: 'fixture-2', name: 'Antidote', slot: 1, character: 'Audino' });
      fixture.positions = [
        { id: staff.id, x: 400, y: 420, facing: 'up', carriedPatientId: '', carriedMedicineId: 'carried-burn' },
        { id: 'fixture-2', x: 560, y: 420, facing: 'up', carriedPatientId: '', carriedMedicineId: 'carried-antidote' },
      ];
      fixture.patients = [];
      fixture.medicineDoses = (['burnHeal', 'antidote', 'burnHeal', 'antidote'] as const)
        .map((kind, slotIndex) => ({ id: `surface-${slotIndex}`, kind, slotIndex,
          location: 'surface' as const, carrierId: '' }));
      fixture.medicineDoses.push(
        { id: 'carried-burn', kind: 'burnHeal', location: 'carrier', carrierId: staff.id, slotIndex: -1 },
        { id: 'carried-antidote', kind: 'antidote', location: 'carrier', carrierId: 'fixture-2', slotIndex: -1 });
      if (name === 'medicine-sway') {
        fixture.positionsAtTime = medicinePreviewPositions;
        fixture.positions = medicinePreviewPositions(0);
      }
      break;
    case 'transport-sway':
    case 'transport-stretcher':
      fixture.positions = [{ id: staff.id, x: 480, y: 375, facing: 'down',
        carriedPatientId: 'fixture-patient' }];
      fixture.patients = [{ ...patient('Pikachu', TREATMENT.healing),
        location: 'carrier', slotIndex: -1, carrierId: staff.id }];
      if (name === 'transport-sway') {
        fixture.positionsAtTime = transportPreviewPositions;
        fixture.positions = transportPreviewPositions(0);
      }
      break;
    case 'recovery-empty':
    case 'recovery-ready':
    case 'recovery-area':
      fixture.positions = [{ id: staff.id, ...RECOVERY_INTERACTION_POINT,
        facing: 'down', carriedPatientId: '' }];
      fixture.patients = (['Eevee', 'Pikachu', 'Bulbasaur'] as const)
        .map((species, slotIndex) => ({ ...patient(species, TREATMENT.healing | TREATMENT.antidote,
          TREATMENT.healing), id: `recovery-${slotIndex}`, location: 'recovery' as const, slotIndex }));
      if (name === 'recovery-empty') fixture.patients = [];
      else fixture.patients[name === 'recovery-ready' ? 0 : 1]!.completedTreatments =
        TREATMENT.healing | TREATMENT.antidote;
      break;
    case 'waiting-lights':
      fixture.positions = [{ id: staff.id, x: 400, y: WAITING_INTERACTION_POINTS[0]!.y, facing: 'left', carriedPatientId: '' }];
      fixture.patients = [
        { ...patient('Eevee', TREATMENT.healing | TREATMENT.antidote, TREATMENT.healing),
          id: 'waiting-occupied', location: 'waiting', slotIndex: 0 },
        { ...patient('Pikachu', TREATMENT.healing, TREATMENT.healing),
          id: 'waiting-ready', location: 'waiting', slotIndex: 2 },
      ];
      break;
    case 'patient-audio': {
      const overview = visualFixture('patient-indicators')!;
      const calm = overview.patients.map((entry, index) => ({ ...entry,
        remainingPatienceMs: index === 0 || index === 5 ? 60000 : entry.remainingPatienceMs,
        completedTreatments: index === 6 ? 0 : entry.completedTreatments }));
      const critical = calm.map((entry, index) => ({ ...entry,
        remainingPatienceMs: index === 0 ? 18000 : index === 5 ? 9000 : entry.remainingPatienceMs }));
      const ready = critical.map((entry, index) => ({ ...entry,
        completedTreatments: index === 6 ? entry.requiredTreatments : entry.completedTreatments }));
      overview.patients = calm;
      overview.patientsAtTime = (timeMs) => timeMs % 14000 >= 6000 ? ready :
        timeMs % 14000 >= 3000 ? critical : calm;
      return overview;
    }
    case 'indicator-alerts': {
      const overview = visualFixture('patient-indicators')!;
      const ready = overview.patients;
      const pending = ready.map((entry) => ({ ...entry, completedTreatments: 0 }));
      overview.patients = pending;
      overview.patientsAtTime = (timeMs) => timeMs % 12000 >= 4000 ? ready : pending;
      return overview;
    }
    case 'patient-indicators': {
      const overview = visualFixture('hud-overview')!;
      overview.patients[1]!.requiredTreatments = TREATMENT.antidote;
      overview.patients[2]!.requiredTreatments = TREATMENT.healing | TREATMENT.burnHeal;
      overview.patients[2]!.completedTreatments = TREATMENT.healing;
      overview.patients[3]!.requiredTreatments = TREATMENT.healing | TREATMENT.antidote;
      overview.patients[4]!.requiredTreatments = TREATMENT.burnHeal;
      overview.patients[5]!.requiredTreatments = TREATMENT.antidote;
      overview.patients[5]!.remainingPatienceMs = 9_000;
      return overview;
    }
    case 'hud-overview': {
      const overview = visualFixture('waiting-expansion')!;
      overview.positions = [{ id: staff.id, ...WAITING_INTERACTION_POINTS[0]!,
        y: WAITING_INTERACTION_POINTS[0]!.y - 10, facing: 'down', carriedPatientId: '' }];
      overview.patients = overview.patients.map((entry, index) => ({ ...entry,
        requiredTreatments: index === 0 ? TREATMENT.healing | TREATMENT.burnHeal : entry.requiredTreatments,
        remainingPatienceMs: [18000, 65000, 40000, 73000, 52000, 31000, 80000, 57000][index]!,
      }));
      return overview;
    }
    case 'waiting-expansion':
      fixture.positions = [{ id: staff.id, x: 480, y: 540, facing: 'down', carriedPatientId: '' }];
      fixture.patients = WAITING_SLOT_POSITIONS.map((_, slotIndex) => ({
        ...patient(PATIENT_SPECIES[slotIndex % PATIENT_SPECIES.length]!, TREATMENT.healing,
          slotIndex === 6 ? TREATMENT.healing : 0),
        id: `waiting-${slotIndex}`, location: 'waiting' as const, slotIndex,
      }));
      break;
    case 'waiting-benches':
      fixture.positions = [{ id: staff.id, x: 400, y: WAITING_INTERACTION_POINTS[0]!.y, facing: 'left', carriedPatientId: '' }];
      fixture.patients = (['Eevee', 'Psyduck', 'Pikachu', 'Bulbasaur'] as const)
        .map((species, slotIndex) => ({ ...patient(species, TREATMENT.healing),
          id: `waiting-${slotIndex}`, location: 'waiting' as const, slotIndex }));
      break;
    case 'clinic-layout':
      fixture.players = [staff, { id: 'fixture-2', name: 'Pharmacy', slot: 1, character: 'Audino' },
        { id: 'fixture-3', name: 'Reception', slot: 2, character: 'Meowth' }];
      fixture.positions = [
        { id: staff.id, ...HEALING_INTERACTION_POINT, facing: 'left', carriedPatientId: '' },
        { id: 'fixture-2', x: 400, y: MEDICINE_PREPARATION_POINTS[0]!.y + 28,
          facing: 'up', carriedPatientId: '' },
        { id: 'fixture-3', x: RECEPTION_CHECK_IN_POINT.x + 80, y: RECEPTION_CHECK_IN_POINT.y + 60,
          facing: 'up', carriedPatientId: '' },
      ];
      fixture.patients = [
        { ...patient('Pikachu', TREATMENT.healing), location: 'healingMachine', slotIndex: 0 },
        { ...patient('Eevee', TREATMENT.burnHeal), id: 'waiting-0', location: 'waiting', slotIndex: 0 },
        { ...patient('Bulbasaur', TREATMENT.antidote), id: 'waiting-2', location: 'waiting', slotIndex: 2 },
        { ...patient('Squirtle', TREATMENT.healing, TREATMENT.healing),
          id: 'recovery-0', location: 'recovery', slotIndex: 0 },
      ];
      fixture.machine = { patientId: 'fixture-patient', status: 'treating', remainingMs: 3000 };
      break;
    case 'center-sign':
    case 'center-room':
    case 'pc-terminal':
    case 'roster':
      fixture.players = [staff, { id: 'fixture-2', name: 'Blue', slot: 1, character: 'Chansey' },
        { id: 'fixture-3', name: 'Green', slot: 2, character: 'Audino' },
        { id: 'fixture-4', name: 'Gold', slot: 3, character: 'Meowth' }];
      fixture.positions = fixture.players.map((player, index) => ({ id: player.id,
        x: [380, 470, 560, 470][index]!, y: index === 3 ? 422 : 350,
        facing: 'up' as const, carriedPatientId: '' }));
      fixture.patients = (['Pikachu', 'Bulbasaur', 'Charmander', 'Squirtle', 'Eevee', 'Psyduck'] as const)
        .map((species, index) => ({ ...patient(species, TREATMENT.healing),
          id: `fixture-${index}`, location: index < 4 ? 'reception' as const : 'waiting' as const,
          slotIndex: index < 4 ? index : index - 4 }));
      break;
    default: return null;
  }
  return fixture;
}


// Walk across the aisle, pause, return and pause so both transitions are visible.
export function transportPreviewPositions(timeMs: number): PlayerPosition[] {
  const phase = ((timeMs % 6000) + 6000) % 6000;
  const progress = phase < 3000 ? Math.min(phase / 2000, 1) : 1 - Math.min((phase - 3000) / 2000, 1);
  return [{ id: staff.id, x: 400 + 160 * progress, y: 375,
    facing: phase < 3000 ? 'right' : 'left', carriedPatientId: 'fixture-patient' }];
}

// Separate lanes and staggered pauses make each carrier's motion easy to compare.
export function medicinePreviewPositions(timeMs: number): PlayerPosition[] {
  return [0, 1].map((index) => {
    const position = transportPreviewPositions(timeMs + index * 1000)[0]!;
    return { ...position, id: index === 0 ? staff.id : 'fixture-2',
      y: index === 0 ? 360 : 435, carriedPatientId: '',
      carriedMedicineId: index === 0 ? 'carried-burn' : 'carried-antidote' };
  });
}

export function entrancePreviewPositions(timeMs: number): PlayerPosition[] {
  const phase = ((timeMs % 8000) + 8000) % 8000;
  const progress = phase < 4000 ? Math.min(phase / 2000, 1) : 1 - Math.min((phase - 4000) / 2000, 1);
  return [{ id: staff.id, x: 480, y: WALK_BOUNDS.bottom - 128 + 100 * progress,
    facing: phase < 4000 ? 'down' : 'up', carriedPatientId: '' }];
}
