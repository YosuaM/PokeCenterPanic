import { DISCHARGE_INTERACTION_POINT, RECEPTION_CHECK_IN_POINT, WALK_BOUNDS, WAITING_SLOT_POSITIONS, WAITING_INTERACTION_POINTS, type Direction, type Point } from './map.js';
import { PATIENT_FAINT_DURATION_MS, type PatientRecord } from './patient.js';

export const PATIENT_ELEVATIONS: Readonly<Record<string, number>> = {
  reception: 0.93, waiting: 0.5, recovery: 0.57, healingMachine: 0.66, carrier: 1.28,
};

const WALK_SPEED = 82;
export const PATIENT_ENTRANCE: Point = { x: 480, y: WALK_BOUNDS.bottom + 62 };
export const PATIENT_CHECK_IN_MS = 1000;

function route(patient: Pick<PatientRecord, 'travelKind' | 'slotIndex'>): Point[] {
  if (patient.travelKind === 'leaving') {
    return [DISCHARGE_INTERACTION_POINT, { x: 840, y: 500 },
      { x: PATIENT_ENTRANCE.x, y: 500 }, PATIENT_ENTRANCE];
  }
  const seat = WAITING_SLOT_POSITIONS[patient.slotIndex];
  return patient.travelKind === 'arriving' && seat ?
    [PATIENT_ENTRANCE, RECEPTION_CHECK_IN_POINT,
      { x: RECEPTION_CHECK_IN_POINT.x, y: WAITING_INTERACTION_POINTS[patient.slotIndex]!.y },
      WAITING_INTERACTION_POINTS[patient.slotIndex]!, seat] : [];
}

export function patientTravelDuration(patient: Pick<PatientRecord, 'travelKind' | 'slotIndex'>): number {
  if (patient.travelKind === 'fainting') return PATIENT_FAINT_DURATION_MS;
  const points = route(patient);
  return points.slice(1).reduce((distance, point, index) => distance +
    Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y), 0) / WALK_SPEED * 1000 + (points.length > 0 && patient.travelKind === 'arriving' ? PATIENT_CHECK_IN_MS : 0);
}

export function patientTravelPose(patient: Pick<PatientRecord, 'travelKind' | 'travelElapsedMs' | 'slotIndex' |
  'faintX' | 'faintY' | 'faintElevation'>,
  extraMs = 0): { point: Point; facing: Direction; elevation: number; moving: boolean } | undefined {
  if (patient.travelKind === 'fainting' && Number.isFinite(patient.faintX) && Number.isFinite(patient.faintY)) {
    return { point: { x: patient.faintX!, y: patient.faintY! }, facing: 'down',
      elevation: patient.faintElevation ?? 0.03, moving: false };
  }
  const points = route(patient);
  if (points.length < 2) return undefined;
  let elapsed = Math.max(0, (patient.travelElapsedMs ?? 0) + extraMs);
  if (patient.travelKind === 'arriving') {
    const checkInAt = Math.hypot(PATIENT_ENTRANCE.x - RECEPTION_CHECK_IN_POINT.x,
      PATIENT_ENTRANCE.y - RECEPTION_CHECK_IN_POINT.y) / WALK_SPEED * 1000;
    if (elapsed >= checkInAt && elapsed < checkInAt + PATIENT_CHECK_IN_MS) {
      return { point: { ...RECEPTION_CHECK_IN_POINT }, facing: 'up', elevation: 0.03, moving: false };
    }
    if (elapsed >= checkInAt) elapsed -= PATIENT_CHECK_IN_MS;
  }
  let distance = elapsed * WALK_SPEED / 1000;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (distance <= length || index === points.length - 1) {
      const progress = Math.min(1, distance / length);
      return { point: { x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress },
      facing: end.x !== start.x ? end.x > start.x ? 'right' : 'left' : end.y > start.y ? 'down' : 'up',
      elevation: patient.travelKind === 'arriving' && index === points.length - 1 ?
        0.03 + 0.47 * progress : 0.03,
      moving: distance < length };
    }
    distance -= length;
  }
  return undefined;
}
