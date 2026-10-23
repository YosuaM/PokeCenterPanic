import { describe, expect, it } from 'vitest';
import { WALK_BOUNDS, SPAWN_POINTS, MEDICINE_DISPOSAL_POINT, isInteractionReachable, RECOVERY_POSITION, RECOVERY_INTERACTION_POINT, TREATMENT, isWalkable, patientPresentation } from '@pokecenter/shared';
import { patientRenderPosition } from '../sprites/pmd.js';
import { visualFixture, transportPreviewPositions } from './visualFixtures.js';

describe('visual QA fixtures', () => {
  it('previews a stocked medicine shelf with the staff member at the Burn Heal station', () => {
    const fixture = visualFixture('medicine-shelf')!;
    expect(fixture.medicineDoses?.map((dose) => [dose.kind, dose.location, dose.slotIndex])).toEqual([
      ['burnHeal', 'stock', 0], ['burnHeal', 'stock', 1], ['burnHeal', 'stock', 2],
      ['antidote', 'stock', 3], ['antidote', 'stock', 4]]);
    expect(fixture.positions.every(isWalkable)).toBe(true);
  });

  it('shows the enlarged clinic with patients in waiting, treatment and recovery instead of on the counter', () => {
    const fixture = visualFixture('clinic-layout')!;
    expect(fixture.patients.map((patient) => patient.location)).toEqual([
      'healingMachine', 'waiting', 'waiting', 'recovery',
    ]);
    expect(fixture.positions.every(isWalkable)).toBe(true);
    expect(fixture.machine.patientId).toBe(fixture.patients[0]!.id);
  });
  it('previews the center sign with staff and patients throughout the room', () => {
    const fixture = visualFixture('center-sign')!;
    expect(fixture).toEqual(visualFixture('roster'));
    expect(visualFixture('pc-terminal')).toEqual(fixture);
    expect(visualFixture('center-room')).toEqual(fixture);

    expect(fixture.players).toHaveLength(4);
    expect(fixture.patients).toHaveLength(6);
    for (const position of fixture.positions) expect(isWalkable(position)).toBe(true);
  });

  it('previews approach, a pause at the door and retreat along a walkable path', () => {
    const fixture = visualFixture('entrance-proximity')!;
    expect(fixture.positions).toEqual(fixture.positionsAtTime!(0));
    expect([0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000]
      .map((time) => fixture.positionsAtTime!(time)[0]!.y)).toEqual([-128, -78, -28, -28, -28, -78, -128, -128, -128].map((offset) => WALK_BOUNDS.bottom + offset));
    for (let time = 0; time <= 8000; time += 20) {
      expect(fixture.positionsAtTime!(time).every(isWalkable)).toBe(true);
    }
  });

  it('shows all four staff at their shared spawn points beside the entrance', () => {
    const fixture = visualFixture('entrance-door')!;
    expect(fixture.players).toHaveLength(4);
    expect(new Set(fixture.players.map((player) => player.character)).size).toBe(4);
    expect(fixture.positions.map(({ x, y }) => ({ x, y }))).toEqual(SPAWN_POINTS);
    expect(fixture.positions.every(isWalkable)).toBe(true);
    expect(fixture.patients).toHaveLength(0);
  });

  it('places a medicine carrier within reach of the disposal container', () => {
    const fixture = visualFixture('medicine-disposal')!;
    const position = fixture.positions[0]!;
    expect(isWalkable(position)).toBe(true);
    expect(isInteractionReachable(position, position.facing, MEDICINE_DISPOSAL_POINT)).toBe(true);
    expect(fixture.medicineDoses).toEqual([expect.objectContaining({
      id: position.carriedMedicineId, carrierId: position.id, location: 'carrier', kind: 'burnHeal' })]);
  });

  it('previews both carried bottles in separate walkable lanes with staggered stops', () => {
    const fixture = visualFixture('medicine-sway')!;
    const positions = fixture.positionsAtTime!;
    expect(positions(0)).toEqual(fixture.positions);
    expect(positions(2000)[0]!.x).toBe(positions(2500)[0]!.x);
    expect(positions(2000)[1]!.x).not.toBe(positions(2500)[1]!.x);
    for (let time = 0; time <= 6000; time += 20) {
      for (const position of positions(time)) {
        expect(isWalkable(position)).toBe(true);
        expect(position.carriedPatientId).toBe('');
        expect(fixture.medicineDoses!.find((dose) => dose.id === position.carriedMedicineId))
          .toMatchObject({ carrierId: position.id, location: 'carrier' });
      }
    }
  });

  it('previews both medicines on all four surfaces and carried by two staff', () => {
    const fixture = visualFixture('medicine-bottles')!;
    const doses = fixture.medicineDoses!;
    expect(doses).toHaveLength(6);
    expect(new Set(doses.map((dose) => dose.id)).size).toBe(6);
    expect(doses.filter((dose) => dose.location === 'surface').map((dose) => dose.slotIndex))
      .toEqual([0, 1, 2, 3]);
    expect(fixture.positions.every(isWalkable)).toBe(true);
    for (const position of fixture.positions) {
      expect(doses.find((dose) => dose.id === position.carriedMedicineId))
        .toMatchObject({ carrierId: position.id, location: 'carrier', slotIndex: -1 });
    }
  });
  it('previews walking and pauses while preserving carrier ownership and walkable positions', () => {
    const fixture = visualFixture('transport-sway')!;
    expect(fixture.positionsAtTime).toBe(transportPreviewPositions);
    expect([0, 1000, 2000, 2500, 3000, 4000, 5000, 5500, 6000]
      .map((time) => fixture.positionsAtTime!(time)[0]!.x))
      .toEqual([400, 480, 560, 560, 560, 480, 400, 400, 400]);
    for (let time = 0; time <= 6000; time += 20) {
      const position = fixture.positionsAtTime!(time)[0]!;
      expect(isWalkable(position)).toBe(true);
      expect(position.carriedPatientId).toBe(fixture.patients[0]!.id);
      expect(position.id).toBe(fixture.patients[0]!.carrierId);
    }
  });
  it('previews a carried patient with matching carrier ownership in the aisle', () => {
    const fixture = visualFixture('transport-stretcher')!;
    expect(fixture.positions.every(isWalkable)).toBe(true);
    const carrier = fixture.positions[0]!;
    expect(fixture.patients[0]).toMatchObject({ id: carrier.carriedPatientId,
      location: 'carrier', carrierId: carrier.id, slotIndex: -1 });
    const stations = { reception: [], waiting: [], recovery: RECOVERY_POSITION,
      healingMachine: { x: 0, y: 0 } };
    expect(patientRenderPosition(fixture.patients[0]!, stations, carrier)).toBe(carrier);
  });
  it('previews empty recovery and distinguishes a ready front patient from one further back', () => {
    expect(visualFixture('recovery-empty')!.patients).toEqual([]);
    const waiting = visualFixture('recovery-area')!.patients;
    const ready = visualFixture('recovery-ready')!.patients;
    expect(waiting.map((patient) => patientPresentation(patient).readyForDischarge))
      .toEqual([false, true, false]);
    expect(ready.map((patient) => patientPresentation(patient).readyForDischarge))
      .toEqual([true, false, false]);
    expect(ready.map((patient) => patient.slotIndex)).toEqual([0, 1, 2]);
  });
  it('previews the recovery queue with only its front patient visible and staff in pickup range', () => {
    const fixture = visualFixture('recovery-area')!;
    expect(fixture.positions[0]).toMatchObject({ ...RECOVERY_INTERACTION_POINT, facing: 'down' });
    expect(fixture.positions.every(isWalkable)).toBe(true);
    expect(fixture.patients.map((patient) => patient.slotIndex)).toEqual([0, 1, 2]);
    expect(fixture.patients.every((patient) => patient.location === 'recovery')).toBe(true);
    expect(new Set(fixture.patients.map((patient) => patient.id)).size).toBe(3);
    const stations = { reception: [], waiting: [], recovery: RECOVERY_POSITION,
      healingMachine: { x: 0, y: 0 } };
    expect(fixture.patients.map((patient) => patientRenderPosition(patient, stations)))
      .toEqual([RECOVERY_POSITION, undefined, undefined]);
  });
  it('shows partial treatment, ready and empty waiting seats in one preview', () => {
    const fixture = visualFixture('waiting-lights')!;
    expect(fixture.positions.every(isWalkable)).toBe(true);
    expect(fixture.patients.map((patient) => patient.slotIndex)).toEqual([0, 2]);
    expect(fixture.patients.every((patient) => patient.location === 'waiting')).toBe(true);
    expect(fixture.patients.map((patient) => patientPresentation(patient).readyForDischarge))
      .toEqual([false, true]);
    expect(new Set(fixture.patients.map((patient) => patient.id)).size).toBe(2);
  });
  it('fills the original four waiting seats while keeping staff in the aisle', () => {
    const fixture = visualFixture('waiting-benches')!;
    expect(fixture.patients.map((patient) => patient.slotIndex)).toEqual([0, 1, 2, 3]);
    expect(fixture.patients.every((patient) => patient.location === 'waiting')).toBe(true);
    expect(new Set(fixture.patients.map((patient) => patient.id)).size).toBe(4);
    expect(fixture.positions.every(isWalkable)).toBe(true);
  });
  it('shows occupied, ready and empty reception slots in one preview', () => {
    const fixture = visualFixture('reception-lights')!;
    expect(fixture.positions.every(isWalkable)).toBe(true);
    expect(fixture.patients.map((patient) => patient.slotIndex)).toEqual([0, 2]);
    expect(fixture.patients.map((patient) => patient.location)).toEqual(['reception', 'reception']);
    expect(fixture.patients[0]!.completedTreatments).toBe(0);
    expect(fixture.patients[1]!.completedTreatments).toBe(fixture.patients[1]!.requiredTreatments);
  });
  it('previews either medicine alone and two staff preparing simultaneously', () => {
    expect(visualFixture('preparing')!.medicineOwners.map(Boolean)).toEqual([true, false]);
    expect(visualFixture('preparing-antidote')!.medicineOwners.map(Boolean)).toEqual([false, true]);
    const both = visualFixture('preparing-both')!;
    expect(both.medicineOwners).toEqual(both.players.map((player) => player.id));
    expect(both.medicineRemainingMs).toEqual([1000, 1000]);
    expect(both.positions.map((position) => position.x)).toEqual([400, 560]);
    expect(both.positions.every(isWalkable)).toBe(true);
  });
  it('shows a completed patient on the machine with no treatment time left', () => {
    const fixture = visualFixture('healed')!;
    expect(fixture.machine).toMatchObject({ status: 'completed', remainingMs: 0 });
    expect(fixture.patients[0]).toMatchObject({ id: fixture.machine.patientId,
      location: 'healingMachine', completedTreatments: TREATMENT.healing });
  });
  it('covers every condition, completion, rejection, and progress state', () => {
    expect(visualFixture('heal')?.patients[0]?.requiredTreatments).toBe(TREATMENT.healing);
    expect(visualFixture('burn')?.patients[0]?.requiredTreatments).toBe(TREATMENT.burnHeal);
    expect(visualFixture('poison')?.patients[0]?.requiredTreatments).toBe(TREATMENT.antidote);
    expect(visualFixture('ready')?.patients[0]?.completedTreatments).toBe(
      TREATMENT.healing | TREATMENT.antidote);
    expect(visualFixture('rejected')?.result).toMatchObject({ ok: false });
    expect(visualFixture('healing')?.machine).toMatchObject({ status: 'treating', remainingMs: 3_000 });
    expect(visualFixture('outage')?.machine).toMatchObject({ status: 'broken', remainingMs: 3_000 });
    expect(visualFixture('repair')?.machine).toMatchObject({ status: 'broken', repairRemainingMs: 1_000 });
    expect(visualFixture('preparing')?.medicineRemainingMs).toEqual([1_000, 0]);
  });
  it('keeps the six patient species and four distinguishable staff slots on valid stations', () => {
    const fixture = visualFixture('roster')!;
    expect(fixture.patients.map((patient) => patient.species)).toEqual(
      ['Pikachu', 'Bulbasaur', 'Charmander', 'Squirtle', 'Eevee', 'Psyduck']);
    expect(fixture.players.map((player) => player.slot)).toEqual([0, 1, 2, 3]);
    expect(new Set(fixture.players.map((player) => player.name)).size).toBe(4);
    expect(fixture.positions.every((position) => isWalkable(position))).toBe(true);
  });
  it('does not activate for an absent or unknown fixture', () => {
    expect(visualFixture(null)).toBeNull();
    expect(visualFixture('unknown')).toBeNull();
  });
});

it('previews eight unique patients on both benches with a ready patient on the new bench', () => {
  const fixture = visualFixture('waiting-expansion')!;
  expect(fixture.patients.map((patient) => patient.slotIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  expect(new Set(fixture.patients.map((patient) => patient.id)).size).toBe(8);
  expect(patientPresentation(fixture.patients[6]!).readyForDischarge).toBe(true);
  expect(fixture.positions.every(isWalkable)).toBe(true);
});

it('previews a full waiting room with a focused critical patient and a discharge-ready neighbor', () => {
  const fixture = visualFixture('hud-overview')!;
  expect(fixture.patients).toHaveLength(8);
  expect(fixture.positions.every(isWalkable)).toBe(true);
  expect(fixture.patients[0]).toMatchObject({ remainingPatienceMs: 18000,
    requiredTreatments: TREATMENT.healing | TREATMENT.burnHeal, completedTreatments: 0 });
  expect(patientPresentation(fixture.patients[6]!).readyForDischarge).toBe(true);
});

it('previews mixed pending care, completed healing and urgent patients in all eight seats', () => {
  const fixture = visualFixture('patient-indicators')!;
  expect(fixture.positions.every(isWalkable)).toBe(true);
  expect(fixture.patients.map((patient) => patient.slotIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  expect(fixture.patients.map((patient) => patient.requiredTreatments & ~patient.completedTreatments))
    .toEqual([3, 4, 2, 5, 2, 4, 0, 1]);
  expect(patientPresentation(fixture.patients[5]!).hp).toBe(10);
  expect(patientPresentation(fixture.patients[6]!).readyForDischarge).toBe(true);
});

it('repeats a real pending-to-ready transition for the animated indicator preview', () => {
  const fixture = visualFixture('indicator-alerts')!;
  const pending = fixture.patientsAtTime!(3000);
  const ready = fixture.patientsAtTime!(4000);
  expect(pending).toBe(fixture.patients);
  expect(patientPresentation(pending[6]!).readyForDischarge).toBe(false);
  expect(patientPresentation(ready[6]!).readyForDischarge).toBe(true);
  expect(fixture.patientsAtTime!(5000)).toBe(ready);
  expect(fixture.patientsAtTime!(12000)).toBe(pending);
  expect(fixture.positions.every(isWalkable)).toBe(true);
});

it('previews separate critical-entry and discharge-ready audio transitions', () => {
  const fixture = visualFixture('patient-audio')!;
  const calm = fixture.patientsAtTime!(0);
  const critical = fixture.patientsAtTime!(3000);
  const ready = fixture.patientsAtTime!(6000);
  expect(calm).toBe(fixture.patients);
  expect(calm[0]!.remainingPatienceMs).toBe(60000);
  expect(critical[0]!.remainingPatienceMs).toBe(18000);
  expect(critical[5]!.remainingPatienceMs).toBe(9000);
  expect(patientPresentation(critical[6]!).readyForDischarge).toBe(false);
  expect(patientPresentation(ready[6]!).readyForDischarge).toBe(true);
  expect(fixture.patientsAtTime!(14000)).toBe(calm);
});
