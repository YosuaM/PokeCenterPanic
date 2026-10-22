import { describe, expect, it } from 'vitest';
import { TREATMENT, WAITING_INTERACTION_POINTS, patientTravelDuration, type PlayerCharacter } from '@pokecenter/shared';
import { RoomAbilities } from './RoomAbilities.js';
import { RoomPatients } from './RoomPatients.js';
import { PlayerState, RoomState } from './RoomState.js';

const seat = WAITING_INTERACTION_POINTS[2]!;

function setup(character: PlayerCharacter = 'Chansey', treatments: number = TREATMENT.healing) {
  const state = new RoomState();
  state.phase = 'running';
  const patients = new RoomPatients(state);
  const abilities = new RoomAbilities(state);
  for (const [id, pokemon] of [['red', character], ['blue', 'Machoke']] as const) {
    const player = new PlayerState();
    player.name = id;
    player.character = pokemon;
    player.carriedPatientId = '';
    player.carriedMedicineId = '';
    player.connected = true;
    player.abilityPatientId = '';
    state.players.set(id, player);
  }
  const patient = patients.admit('Eevee', treatments, 2, 'waiting')!;
  patients.advance(patientTravelDuration({ travelKind: 'arriving', slotIndex: 2 }));
  let position = { ...seat };
  const start = (id = 'red', now = 0, expected = patient.id, stationary = true) =>
    abilities.start(id, { targetId: 'waiting:2', expectedOccupantId: expected }, position, 'down', now, stationary);
  const hold = (now: number, id = 'red', held = true) => {
    abilities.onInput(id, held, null, now);
    abilities.advance(now, () => position, () => 'down');
  };
  const moveTo = (point: { x: number; y: number }) => { position = point; };
  return { state, patients, abilities, patient, start, hold, moveTo };
}

describe('character abilities', () => {
  it('lets Chansey heal a seated patient in place with a three-second Soft-Boiled', () => {
    const { state, patient, start, hold } = setup('Chansey', TREATMENT.healing | TREATMENT.burnHeal);
    expect(start()).toEqual({ ok: true, reason: '' });
    expect(state.players.get('red')).toMatchObject({ abilityPatientId: patient.id, abilityRemainingMs: 3000 });
    for (let now = 200; now < 3000; now += 200) hold(now);
    expect(patient.completedTreatments).toBe(0);
    expect(state.players.get('red')!.abilityRemainingMs).toBe(200);
    hold(3000);
    expect(patient.completedTreatments).toBe(TREATMENT.healing);
    expect(patient.location).toBe('waiting');
    expect(state.players.get('red')).toMatchObject({ abilityPatientId: '', abilityRemainingMs: 0 });
    expect(start('red', 3100).reason).toBe('Release Q before using it again');
    hold(3200, 'red', false);
    expect(start('red', 3300).reason).toBe('Healing not needed');
  });

  it('lets Audino calm a patient once, restoring a quarter of the patience without exceeding it', () => {
    const { patient, start, hold } = setup('Audino');
    patient.remainingPatienceMs = 30_000;
    expect(start().ok).toBe(true);
    for (let now = 250; now <= 2000; now += 250) hold(now);
    expect(patient.remainingPatienceMs).toBe(30_000 + 0.25 * patient.initialPatienceMs);
    hold(2100, 'red', false);
    expect(start('red', 2200).reason).toBe('Patient is already calm');
    const other = setup('Audino');
    other.patient.remainingPatienceMs = other.patient.initialPatienceMs - 1;
    expect(other.start().ok).toBe(true);
    other.hold(2000);
    expect(other.patient.remainingPatienceMs).toBe(other.patient.initialPatienceMs);
  });

  it.each([
    ['release', (world: ReturnType<typeof setup>) => world.hold(1000, 'red', false)],
    ['movement', (world: ReturnType<typeof setup>) => world.abilities.onInput('red', true, 'left', 1000)],
    ['stale input', (world: ReturnType<typeof setup>) => world.abilities.advance(1000, () => seat, () => 'down')],
    ['range loss', (world: ReturnType<typeof setup>) => { world.moveTo({ x: 480, y: 200 }); world.hold(1000); }],
    ['pickup by another player', (world: ReturnType<typeof setup>) => {
      world.patients.interact('blue', { targetId: 'waiting:2', expectedOccupantId: world.patient.id }, seat, 'down');
      world.hold(1000);
    }],
    ['disconnect', (world: ReturnType<typeof setup>) => world.abilities.releasePlayer('red')],
  ] as const)('cancels on %s without treating the patient', (_name, interrupt) => {
    const world = setup();
    expect(world.start().ok).toBe(true);
    world.hold(250);
    interrupt(world);
    world.hold(3500);
    expect(world.patient.completedTreatments).toBe(0);
    expect(world.state.players.get('red')!.abilityPatientId).toBe('');
  });

  it('rejects abilities that do not apply', () => {
    expect(setup('Machoke').start().reason).toBe('This Pokémon has no special ability');
    expect(setup('Meowth').start().reason).toBe('This Pokémon has no special ability');
    const busy = setup();
    busy.state.players.get('red')!.carriedMedicineId = 'dose';
    expect(busy.start().reason).toBe('Hands must be empty');
    expect(setup().start('red', 0, undefined, false).reason).toBe('Stop moving to use your ability');
    expect(setup().start('red', 0, 'stale').reason).toBe('Patient changed');
    expect(setup('Chansey', TREATMENT.burnHeal).start().reason).toBe('Healing not needed');
    const rested = setup('Audino');
    rested.patient.remainingPatienceMs = rested.patient.initialPatienceMs;
    expect(rested.start().reason).toBe('Patient is already calm');
    const far = setup();
    far.moveTo({ x: 480, y: 200 });
    expect(far.start().reason).toBe('Target out of range');
    const outside = setup();
    outside.state.phase = 'results';
    expect(outside.start().reason).toBe('Ability unavailable');
    const empty = setup();
    expect(empty.abilities.start('red', { targetId: 'healing:0', expectedOccupantId: '' }, seat, 'down', 0, true).reason)
      .toBe('Choose a seated patient');
  });

  it('gives one patient to one carer at a time and refuses arriving patients', () => {
    const world = setup();
    world.state.players.get('blue')!.character = 'Chansey';
    expect(world.start().ok).toBe(true);
    expect(world.start('blue').reason).toBe('Another staff member is caring for this patient');
    const arriving = setup();
    arriving.patient.travelKind = 'arriving';
    expect(arriving.start().reason).toBe('Patient is still moving');
  });

  it('clears holds and calm history on reset', () => {
    const { abilities, patient, start, state } = setup('Audino');
    patient.remainingPatienceMs = 10_000;
    expect(start().ok).toBe(true);
    abilities.reset();
    expect(abilities.isHolding('red')).toBe(false);
    expect(state.players.get('red')!.abilityPatientId).toBe('');
    expect(abilities.requiresRelease('red')).toBe(false);
  });
});
