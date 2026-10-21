import { describe, expect, it } from 'vitest';
import { RECEPTION_CHECK_IN_POINT, DISCHARGE_INTERACTION_POINT, WAITING_SLOT_POSITIONS, WALK_BOUNDS, PLAYER_HALF_HEIGHT, isWalkable } from './map.js';
import { PATIENT_CHECK_IN_MS, PATIENT_ENTRANCE, patientTravelDuration, patientTravelPose } from './patientTravel.js';

describe('patient travel', () => {
  it('checks in at reception before continuing to the reserved waiting seat', () => {
    const patient = { travelKind: 'arriving' as const, slotIndex: 0, travelElapsedMs: 0 };
    const checkInAt = (PATIENT_ENTRANCE.y - RECEPTION_CHECK_IN_POINT.y) / 82 * 1000;
    for (const time of [checkInAt, checkInAt + PATIENT_CHECK_IN_MS - 1]) {
      expect(patientTravelPose(patient, time)).toEqual({ point: RECEPTION_CHECK_IN_POINT,
        facing: 'up', elevation: 0.03, moving: false });
    }
    expect(patientTravelPose(patient, checkInAt + PATIENT_CHECK_IN_MS + 100)?.facing).toBe('down');
    expect(patientTravelPose(patient, -100)?.point).toEqual(PATIENT_ENTRANCE);
    expect(patientTravelDuration({ travelKind: 'arriving', slotIndex: 99 })).toBe(0);
  });
  it('holds the faint effect at its last authoritative position instead of following a freed carrier or seat', () => {
    const faint = { travelKind: 'fainting' as const, slotIndex: -1, travelElapsedMs: 100,
      faintX: 400, faintY: 365, faintElevation: 1.28 };
    expect(patientTravelDuration(faint)).toBe(1600);
    expect(patientTravelPose(faint, 500)).toMatchObject({ point: { x: 400, y: 365 }, elevation: 1.28, moving: false });
  });
  it.each(WAITING_SLOT_POSITIONS.map((_, index) => index))('walks through the aisle to reserved seat %s without crossing equipment', (slotIndex) => {
    const patient = { travelKind: 'arriving' as const, slotIndex, travelElapsedMs: 0 };
    const duration = patientTravelDuration(patient);
    expect(patientTravelPose(patient)).toMatchObject({ point: PATIENT_ENTRANCE, facing: 'up', elevation: 0.03 });
    for (let time = 0; time < duration; time += 50) {
      const pose = patientTravelPose(patient, time)!;
      if (pose.point.y > WALK_BOUNDS.bottom - PLAYER_HALF_HEIGHT || pose.elevation > 0.03) continue;
      expect(isWalkable(pose.point), JSON.stringify(pose.point)).toBe(true);
    }
    expect(patientTravelPose(patient, duration + 100)).toMatchObject({
      point: WAITING_SLOT_POSITIONS[slotIndex], elevation: 0.5, moving: false,
    });
  });

  it('routes a discharged patient around the medicine table and machines to the entrance', () => {
    const patient = { travelKind: 'leaving' as const, slotIndex: -1, travelElapsedMs: 0 };
    const duration = patientTravelDuration(patient);
    expect(patientTravelPose(patient)?.point).toEqual(DISCHARGE_INTERACTION_POINT);
    for (let time = 0; time < duration; time += 25) {
      const point = patientTravelPose(patient, time)!.point;
      if (point.y <= WALK_BOUNDS.bottom - PLAYER_HALF_HEIGHT) expect(isWalkable(point), JSON.stringify(point)).toBe(true);
    }
    expect(patientTravelPose(patient, duration + 10)).toMatchObject({ point: PATIENT_ENTRANCE, moving: false });
    expect(patientTravelPose({ slotIndex: 0 })).toBeUndefined();
    expect(patientTravelPose({ travelKind: 'arriving', slotIndex: 99 })).toBeUndefined();
  });
});
