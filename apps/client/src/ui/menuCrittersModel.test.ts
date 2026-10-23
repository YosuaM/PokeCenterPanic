import { describe, expect, it } from 'vitest';
import { ART_HEIGHT } from './menuAtmosphereModel.js';
import { ART_WIDTH } from './menuAtmosphereModel.js';
import { FLIGHT_CYCLE_SECONDS, FLIGHT_SECONDS, FLIGHT_START_SECONDS, FLIGHT_WAVE_SECONDS, flyerPose, GREETER, PATIENT_CYCLE_SECONDS, PATIENT_ROUTE, PATIENT_SPECIES, PATIENT_WALK_SECONDS, WANDER, critterPoses,
  depthScale, facingRow, frameAt, greeterPose, patientPose, routeLength, routePoint, wanderPose } from './menuCrittersModel.js';

describe('critter geometry', () => {
  it('walks a polyline by distance and clamps at its ends', () => {
    const route = [{ x: 0, y: 0 }, { x: 30, y: 40 }, { x: 30, y: 90 }];
    expect(routeLength(route)).toBe(100);
    expect(routePoint(route, -5)).toMatchObject({ x: 0, y: 0, dx: 30, dy: 40 });
    expect(routePoint(route, 25)).toMatchObject({ x: 15, y: 20 });
    expect(routePoint(route, 75)).toMatchObject({ x: 30, y: 65, dx: 0, dy: 50 });
    expect(routePoint(route, 500)).toMatchObject({ x: 30, y: 90 });
    expect(routePoint([{ x: 4, y: 5 }], 10)).toMatchObject({ x: 4, y: 5 });
  });

  it('maps headings to PMD rows counter-clockwise from facing the viewer', () => {
    expect(facingRow(0, 1)).toBe(0);
    expect(facingRow(1, 1)).toBe(1);
    expect(facingRow(1, 0)).toBe(2);
    expect(facingRow(1, -1)).toBe(3);
    expect(facingRow(0, -1)).toBe(4);
    expect(facingRow(-1, -1)).toBe(5);
    expect(facingRow(-1, 0)).toBe(6);
    expect(facingRow(-1, 1)).toBe(7);
    expect(facingRow(0, 0)).toBe(0);
  });

  it('times frames with PMD tick durations and loops them', () => {
    expect(frameAt([6, 12, 6], 0)).toBe(0);
    expect(frameAt([6, 12, 6], 0.1)).toBe(1);
    expect(frameAt([6, 12, 6], 0.35)).toBe(2);
    expect(frameAt([6, 12, 6], 0.4)).toBe(0);
    expect(frameAt([6, 12, 6], -0.05)).toBe(2);
    expect(frameAt([], 1)).toBe(0);
  });

  it('draws nearer Pokémon larger', () => {
    expect(depthScale(600)).toBe(depthScale(640));
    expect(depthScale(800)).toBeGreaterThan(depthScale(700));
    expect(depthScale(2000)).toBe(depthScale(970));
  });
});

describe('title-screen critters', () => {
  it('sends a patient from below the artwork up to the door, then fades it inside before the next species', () => {
    const start = patientPose(0)!;
    expect(start).toMatchObject({ species: 'Pikachu', animation: 'walk', alpha: 1, row: facingRow(-27, -85) });
    expect(start.y).toBeGreaterThan(ART_HEIGHT);
    const middle = patientPose(PATIENT_WALK_SECONDS / 2)!;
    expect(middle.y).toBeLessThan(start.y);
    expect(middle.y).toBeGreaterThan(PATIENT_ROUTE.at(-1)!.y);
    const door = patientPose(PATIENT_WALK_SECONDS + 0.4)!;
    expect(door).toMatchObject({ animation: 'idle', x: PATIENT_ROUTE.at(-1)!.x, y: PATIENT_ROUTE.at(-1)!.y });
    expect(door.alpha).toBeCloseTo(0.5);
    expect(patientPose(PATIENT_WALK_SECONDS + 2)).toBeNull();
    expect(patientPose(PATIENT_CYCLE_SECONDS)!.species).toBe('Eevee');
    expect(patientPose(PATIENT_CYCLE_SECONDS * PATIENT_SPECIES.length)!.species).toBe('Pikachu');
    expect(patientPose(-1)).toBeNull();
  });

  it('turns the greeter toward the arriving patient and back to the path when nobody comes', () => {
    const patient = patientPose(0)!;
    expect(greeterPose(3, patient)).toMatchObject({ species: 'Chansey', animation: 'idle', x: GREETER.x, y: GREETER.y,
      row: facingRow(patient.x - GREETER.x, patient.y - GREETER.y), clock: 3 });
    expect(greeterPose(3, null).row).toBe(7);
  });

  it('strolls Meowth back and forth with rests at each end', () => {
    expect(wanderPose(0)).toMatchObject({ species: 'Meowth', animation: 'walk', x: WANDER[0].x, y: WANDER[0].y,
      row: facingRow(WANDER[1].x - WANDER[0].x, WANDER[1].y - WANDER[0].y) });
    expect(wanderPose(7)).toMatchObject({ animation: 'idle', x: WANDER[1].x, y: WANDER[1].y, row: 0, clock: 1 });
    expect(wanderPose(13)).toMatchObject({ animation: 'walk', row: facingRow(WANDER[0].x - WANDER[1].x, WANDER[0].y - WANDER[1].y) });
    expect(wanderPose(10 + 6)).toMatchObject({ x: WANDER[0].x, y: WANDER[0].y });
  });

  it('flies Lugia across the whole sky now and then, alternating direction', () => {
    expect(flyerPose(0)).toBeNull();
    const enter = flyerPose(FLIGHT_START_SECONDS)!;
    expect(enter).toMatchObject({ species: 'Lugia', row: 2, alpha: 1 });
    expect(enter.x).toBeLessThan(0);
    const exit = flyerPose(FLIGHT_START_SECONDS + FLIGHT_SECONDS)!;
    expect(exit.x).toBeGreaterThan(ART_WIDTH);
    const middle = flyerPose(FLIGHT_START_SECONDS + FLIGHT_SECONDS / 2)!;
    expect(middle.y).toBeGreaterThan(0);
    expect(middle.y).toBeLessThan(260);
    expect(flyerPose(FLIGHT_START_SECONDS + FLIGHT_SECONDS + 1)).toBeNull();
    const back = flyerPose(FLIGHT_CYCLE_SECONDS + FLIGHT_START_SECONDS)!;
    expect(back.row).toBe(6);
    expect(back.x).toBeGreaterThan(ART_WIDTH);
    expect(flyerPose(FLIGHT_CYCLE_SECONDS + FLIGHT_START_SECONDS + FLIGHT_SECONDS)!.x).toBeLessThan(0);
  });

  it('flaps while Lugia climbs and glides while it sinks', () => {
    const step = 0.05;
    for (let time = FLIGHT_START_SECONDS; time < FLIGHT_START_SECONDS + FLIGHT_SECONDS - step; time += 0.37) {
      const now = flyerPose(time)!, next = flyerPose(time + step)!;
      const rising = next.y < now.y - 0.5, sinking = next.y > now.y + 0.5;
      if (rising) expect(now.animation).toBe('hover');
      if (sinking) expect(now.animation).toBe('walk');
    }
    const quarter = FLIGHT_WAVE_SECONDS / 4;
    expect(flyerPose(FLIGHT_START_SECONDS + quarter * 0.5)!.animation).toBe('walk');
    expect(flyerPose(FLIGHT_START_SECONDS + quarter * 2)!.animation).toBe('hover');
    expect(flyerPose(FLIGHT_START_SECONDS + quarter * 3.5)!.animation).toBe('walk');
  });

  it('lists everyone back to front and drops the patient while it is inside', () => {
    const poses = critterPoses(4);
    expect(poses.map((pose) => pose.species).sort()).toEqual(['Chansey', 'Meowth', 'Pikachu']);
    expect(poses.map((pose) => pose.y)).toEqual([...poses.map((pose) => pose.y)].sort((a, b) => a - b));
    expect(critterPoses(PATIENT_WALK_SECONDS + 3).map((pose) => pose.species).sort()).toEqual(['Chansey', 'Meowth']);
  });
});
