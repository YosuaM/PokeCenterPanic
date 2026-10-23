import { describe, expect, it } from 'vitest';
import { HEALING_INTERACTION_POINT, MEDICINE_PREPARATION_MS, REPAIR_DURATION_MS, TREATMENT,
  walkingSpeedMultiplier, type PlayerCharacter } from '@pokecenter/shared';
import { RoomIncidents } from './RoomIncidents.js';
import { RoomMedicine } from './RoomMedicine.js';
import { RoomMovement } from './RoomMovement.js';
import { RoomPatients } from './RoomPatients.js';
import { PlayerState, RoomState } from './RoomState.js';

function staff(state: RoomState, id: string, character: PlayerCharacter): PlayerState {
  const player = new PlayerState();
  player.name = id;
  player.character = character;
  player.carriedPatientId = '';
  player.carriedMedicineId = '';
  player.connected = true;
  state.players.set(id, player);
  return player;
}

describe('character advantages', () => {
  it.each([['Chansey', false, 144], ['Meowth', false, 165.6], ['Machoke', false, 144], ['Machoke', true, 172.8]] as const)(
    'walks %s (carrying: %s) %s units per second', (character, carrying, distance) => {
      const state = new RoomState();
      const player = staff(state, 'red', character);
      if (carrying) player.carriedPatientId = 'patient';
      const movement = new RoomMovement((id) => walkingSpeedMultiplier(state.players.get(id)?.character,
        Boolean(state.players.get(id)?.carriedPatientId)));
      const start = movement.add('red').position.x;
      for (let now = 50; now <= 1000; now += 50) {
        movement.accept('red', { direction: 'right', sequence: now, roundId: null }, now);
        movement.advance(50, now);
      }
      expect(movement.position('red')!.x - start).toBeCloseTo(distance, 1);
    });

  it('ignores invalid speed multipliers instead of moving unpredictably', () => {
    for (const multiplier of [0, -1, Number.NaN, Infinity]) {
      const movement = new RoomMovement(() => multiplier);
      const start = { ...movement.add('red').position };
      movement.accept('red', { direction: 'right', sequence: 1, roundId: null }, 0);
      movement.advance(50, 0);
      expect(movement.position('red')).toEqual(start);
    }
  });

  it.each([['Audino', 1000], ['Chansey', MEDICINE_PREPARATION_MS]] as const)(
    'prepares a dose as %s in %s ms', (character, durationMs) => {
      const state = new RoomState();
      const medicine = new RoomMedicine(state);
      staff(state, 'red', character);
      const position = { x: 400, y: 70 };
      expect(medicine.interact('red', { targetId: 'medicine:prep:0', expectedOccupantId: '', sequence: 1,
        roundId: 'round' }, position, 'up', 0, true).ok).toBe(true);
      expect(state.medicinePreparationRemainingMs[0]).toBe(durationMs);
      for (let now = 100; now < durationMs; now += 100) {
        medicine.onInput('red', true, null, now);
        medicine.advance(now, () => position, () => 'up');
      }
      expect(state.medicineStock[0]).toBe('');
      medicine.onInput('red', true, null, durationMs);
      medicine.advance(durationMs, () => position, () => 'up');
      expect(state.medicineStock[0]).not.toBe('');
    });

  it.each([['Machoke', 1000], ['Meowth', REPAIR_DURATION_MS]] as const)(
    'repairs an outage as %s in %s ms', (character, durationMs) => {
      const state = new RoomState();
      state.phase = 'running';
      new RoomPatients(state);
      const incidents = new RoomIncidents(state);
      staff(state, 'red', character);
      state.healingMachine.status = 'broken';
      expect(incidents.interact('red', { targetId: 'healing:0', expectedOccupantId: '' },
        HEALING_INTERACTION_POINT, 'up', 0, true).ok).toBe(true);
      expect(state.healingMachine.repairRemainingMs).toBe(durationMs);
      expect(incidents.nextBoundary(10_000)).toBe(250);
      for (let now = 100; now < durationMs; now += 100) {
        incidents.onInput('red', true, null, now);
        incidents.advance(now, () => HEALING_INTERACTION_POINT, () => 'up');
      }
      expect(state.healingMachine.status).toBe('broken');
      incidents.onInput('red', true, null, durationMs);
      incidents.advance(durationMs, () => HEALING_INTERACTION_POINT, () => 'up');
      expect(state.healingMachine.status).toBe('empty');
    });

  it.each([['Chansey', 2857], ['Audino', 4000]] as const)(
    'starts a machine as %s with a %s ms treatment', (character, durationMs) => {
      const state = new RoomState();
      const patients = new RoomPatients(state);
      staff(state, 'red', character);
      const patient = patients.admit('Pikachu', TREATMENT.healing, 0)!;
      patients.interact('red', { targetId: 'reception:0', expectedOccupantId: patient.id }, { x: 348, y: 344 }, 'up');
      expect(patients.interact('red', { targetId: 'healing:0', expectedOccupantId: '' },
        HEALING_INTERACTION_POINT, 'up').ok).toBe(true);
      expect(state.healingMachine).toMatchObject({ status: 'treating', remainingMs: durationMs, durationMs });
      patients.advance(durationMs - 1);
      expect(state.healingMachine.status).toBe('treating');
      patients.advance(1);
      expect(state.healingMachine.status).toBe('completed');
    });
});
