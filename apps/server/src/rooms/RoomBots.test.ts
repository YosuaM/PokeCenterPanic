import { describe, expect, it } from 'vitest';
import { PLAYER_CHARACTERS, TREATMENT, walkingSpeedMultiplier, type PatientSpecies,
  type PlayerCharacter } from '@pokecenter/shared';
import { RoomAbilities } from './RoomAbilities.js';
import { RoomBots } from './RoomBots.js';
import { RoomCommands } from './RoomCommands.js';
import { RoomIncidents } from './RoomIncidents.js';
import { RoomLobby } from './RoomLobby.js';
import { RoomMedicine } from './RoomMedicine.js';
import { RoomMovement } from './RoomMovement.js';
import { RoomPatients } from './RoomPatients.js';
import { RoomRound } from './RoomRound.js';
import { MedicineDoseState, PlayerState, RoomState, roomHealingMachines } from './RoomState.js';

/** Real gameplay modules driven by a simulated 50 ms server tick, with no network. */
function clinic(characters: readonly PlayerCharacter[], withHost = false) {
  const state = new RoomState();
  let now = 1_000;
  const movement = new RoomMovement((id) => {
    const player = state.players.get(id);
    return walkingSpeedMultiplier(player?.character, Boolean(player?.carriedPatientId));
  });
  const patients = new RoomPatients(state, () => now);
  const medicine = new RoomMedicine(state);
  const incidents = new RoomIncidents(state);
  const abilities = new RoomAbilities(state);
  const lobby = new RoomLobby(state, 1_000, () => 'round');
  const round = new RoomRound(state, patients, medicine, movement, 360_000, incidents, abilities);
  const commands = new RoomCommands(state, movement, patients, medicine, incidents, abilities);
  const bots = new RoomBots(state, movement, lobby, commands);
  if (withHost) {
    const host = new PlayerState();
    host.name = 'Host';
    host.connected = true;
    host.bot = false;
    host.character = '';
    state.players.set('host', host);
    movement.add('host');
    lobby.joined('host');
  }
  const ids = characters.map((character) => {
    const id = bots.add()!;
    state.players.get(id)!.character = character;
    return id;
  });
  const start = () => {
    state.phase = 'running';
    state.roundId = 'round';
    round.start(now);
  };
  const run = (ms: number, until?: () => boolean) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 50) {
      now += 50;
      round.advance(now);
      bots.advance(now);
      movement.advance(50, now);
      if (until?.()) return true;
    }
    return until?.() ?? false;
  };
  const admit = (species: PatientSpecies, treatments: number, slot: number) =>
    patients.admit(species, treatments, slot, 'waiting')!;
  return { state, bots, lobby, ids, start, run, admit, patients, abilities, movement, now: () => now };
}

describe('bot lobby seats', () => {
  it('adds ready bots with distinct free Pokémon and yields a Pokémon to a person', () => {
    const { state, bots, lobby } = clinic([], true);
    const added = [bots.add(), bots.add(), bots.add()];
    expect(added.every(Boolean)).toBe(true);
    expect(bots.add()).toBeNull();
    const characters = added.map((id) => state.players.get(id!)!.character);
    expect(new Set(characters).size).toBe(3);
    expect(added.every((id) => state.players.get(id!)!.ready && state.players.get(id!)!.bot)).toBe(true);
    expect(lobby.select('host', { sequence: 1, roundId: null, character: characters[0] }).ok).toBe(true);
    expect(state.players.get('host')!.character).toBe(characters[0]);
    expect(new Set([...state.players.values()].map((player) => player.character)).size).toBe(4);
    expect(lobby.ready('host', { sequence: 2, roundId: null, ready: true }).ok).toBe(true);
    expect(lobby.start('host', { sequence: 3, roundId: null }, 0).ok).toBe(true);
  });

  it('keeps bots ready, never makes them host and removes them cleanly', () => {
    const { state, bots, lobby } = clinic([], true);
    const bot = bots.add()!;
    expect(lobby.hostCommand(bot, { sequence: 1, roundId: null }).ok).toBe(false);
    expect(lobby.hostCommand('host', { sequence: 1, roundId: null }).ok).toBe(true);
    expect(lobby.hostCommand('host', { sequence: 1, roundId: null }).reason).toBe('Invalid or repeated lobby command');
    lobby.departed('host');
    expect(state.hostId).toBe('');
    expect(state.players.get(bot)!.ready).toBe(true);
    expect(bots.remove(bot)).toBe(true);
    expect(bots.remove(bot)).toBe(false);
    expect(state.players.has(bot)).toBe(false);
    expect(lobby.isBot(bot)).toBe(false);
  });
});

describe('bot Pokémon changes', () => {
  it('moves a bot only to a valid Pokémon nobody else holds', () => {
    const { state, bots, lobby } = clinic([], true);
    const [first, second] = [bots.add()!, bots.add()!];
    const held = state.players.get(second)!.character;
    expect(lobby.setBotCharacter('host', 'Meowth')).toEqual({ ok: false, reason: 'Unknown bot' });
    expect(lobby.setBotCharacter(42, 'Meowth').reason).toBe('Unknown bot');
    expect(lobby.setBotCharacter(first, 'Mew').reason).toBe('Choose a valid character');
    expect(lobby.setBotCharacter(first, held).reason).toBe('This Pokémon is already chosen');
    expect(lobby.select('host', { sequence: 1, roundId: null, character: lobby.freeCharacters()[0] }).ok).toBe(true);
    const free = lobby.freeCharacters();
    expect(free).toHaveLength(1);
    expect(lobby.setBotCharacter(first, state.players.get('host')!.character).reason)
      .toBe('This Pokémon is already chosen');
    expect(lobby.setBotCharacter(first, state.players.get(first)!.character).ok).toBe(true);
    expect(lobby.setBotCharacter(first, free[0])).toEqual({ ok: true, reason: '' });
    expect(state.players.get(first)!.character).toBe(free[0]);
    expect(state.players.get(first)!.ready).toBe(true);
    expect(new Set([...state.players.values()].map((player) => player.character)).size).toBe(3);
  });
});

describe('bot readiness across lobby resets', () => {
  it('keeps bots ready when a countdown is cancelled or the host returns to the lobby', () => {
    const { state, bots, lobby } = clinic([], true);
    const bot = bots.add()!;
    const guest = new PlayerState();
    guest.name = 'Guest';
    guest.connected = true;
    guest.character = '';
    state.players.set('guest', guest);
    lobby.joined('guest');
    for (const id of ['host', 'guest']) {
      const free = lobby.freeCharacters()[0];
      expect(lobby.select(id, { sequence: 1, roundId: null, character: free }).ok).toBe(true);
      expect(lobby.ready(id, { sequence: 2, roundId: null, ready: true }).ok).toBe(true);
    }
    expect(lobby.start('host', { sequence: 3, roundId: null }, 0).ok).toBe(true);
    lobby.departed('guest', true);
    expect(state.phase).toBe('lobby');
    expect(state.players.get('host')!.ready).toBe(false);
    expect(state.players.get(bot)!.ready).toBe(true);
    state.phase = 'results';
    state.roundId = 'round';
    expect(lobby.replay('host', { sequence: 4, roundId: 'round' }).ok).toBe(true);
    expect(state.players.get(bot)!.ready).toBe(true);
  });
});

describe('bot care by specialty', () => {
  it('lets a Machoke porter carry an injured patient to a machine and discharge it', () => {
    const world = clinic(['Machoke']);
    world.start();
    const patient = world.admit('Pikachu', TREATMENT.healing, 3);
    expect(world.run(40_000, () => world.state.dischargedCount === 1)).toBe(true);
    expect(patient.lifecycle).toBe('discharged');
    expect(world.state.lostCount).toBe(0);
  });

  it('lets a Chansey nurse heal at the seat with Soft-Boiled instead of using a machine', () => {
    const world = clinic(['Chansey']);
    world.start();
    const patient = world.admit('Eevee', TREATMENT.healing, 4);
    let usedMachine = false;
    expect(world.run(40_000, () => {
      usedMachine ||= roomHealingMachines(world.state).some((machine) => machine.patientId === patient.id);
      return world.state.dischargedCount === 1;
    })).toBe(true);
    expect(usedMachine).toBe(false);
  });

  it('lets an Audino pharmacist prepare, apply and discharge both medicines', () => {
    const world = clinic(['Audino']);
    world.start();
    world.admit('Charmander', TREATMENT.burnHeal, 0);
    world.admit('Bulbasaur', TREATMENT.antidote, 7);
    expect(world.run(60_000, () => world.state.dischargedCount === 2)).toBe(true);
    expect(world.state.lostCount).toBe(0);
  });

  it('lets a Machoke repair a broken machine and finish the interrupted treatment', () => {
    const world = clinic(['Machoke']);
    world.start();
    const machine = roomHealingMachines(world.state)[1]!;
    machine.status = 'broken';
    expect(world.run(20_000, () => machine.status !== 'broken')).toBe(true);
    expect(machine.status).toBe('empty');
  });

  it('shares a busy clinic across four bots without losing patients', () => {
    const world = clinic(PLAYER_CHARACTERS);
    world.start();
    const plan: [PatientSpecies, number][] = [
      ['Pikachu', TREATMENT.healing], ['Charmander', TREATMENT.burnHeal], ['Bulbasaur', TREATMENT.antidote],
      ['Squirtle', TREATMENT.healing | TREATMENT.burnHeal], ['Eevee', TREATMENT.healing | TREATMENT.antidote],
      ['Psyduck', TREATMENT.healing],
    ];
    plan.forEach(([species, treatments], slot) => world.admit(species, treatments, slot));
    expect(world.run(80_000, () => world.state.dischargedCount === plan.length)).toBe(true);
    expect(world.state.lostCount).toBe(0);
    expect(() => world.patients.assertOwnership()).not.toThrow();
  });

  it('leaves an early dose on the shelf instead of juggling it until its patient can be treated', () => {
    const world = clinic(['Audino']);
    world.start();
    const patient = world.admit('Bulbasaur', TREATMENT.antidote, 7);
    const bot = world.state.players.get(world.ids[0]!)!;
    let pickups = 0;
    let carrying = '';
    expect(world.run(60_000, () => {
      if (bot.carriedMedicineId && bot.carriedMedicineId !== carrying) pickups += 1;
      carrying = bot.carriedMedicineId;
      // While the patient is still walking in, the prepared dose must wait on the shelf.
      if (patient.travelKind === 'arriving') expect(bot.carriedMedicineId).toBe('');
      return world.state.dischargedCount === 1;
    })).toBe(true);
    expect(pickups).toBe(1);
  });

  it('puts an unneeded dose back on its shelf and then stays empty-handed', () => {
    const world = clinic(['Meowth']);
    world.start();
    const bot = world.state.players.get(world.ids[0]!)!;
    const dose = new MedicineDoseState();
    Object.assign(dose, { id: 'spare', kind: 'antidote', location: 'carrier', carrierId: world.ids[0]!, slotIndex: -1 });
    world.state.medicineDoses.set(dose.id, dose);
    bot.carriedMedicineId = dose.id;
    expect(world.run(15_000, () => world.state.medicineStock[3] === 'spare')).toBe(true);
    let pickups = 0;
    world.run(10_000, () => { if (bot.carriedMedicineId) pickups += 1; return false; });
    expect(pickups).toBe(0);
    expect(dose).toMatchObject({ location: 'stock', slotIndex: 3 });
  });

  it('does nothing outside a running round', () => {
    const world = clinic(['Meowth']);
    world.admit('Pikachu', TREATMENT.healing, 0);
    const before = { ...world.movement.position(world.ids[0]!)! };
    world.run(5_000);
    expect(world.movement.position(world.ids[0]!)).toEqual(before);
  });
});
