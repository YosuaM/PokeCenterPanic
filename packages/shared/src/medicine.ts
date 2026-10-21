import type { Point } from './map.js';

export const MEDICINE_KINDS = ['burnHeal', 'antidote'] as const;
export type MedicineKind = typeof MEDICINE_KINDS[number];
export type MedicineLocation = 'carrier' | 'surface';

export const MEDICINE_PREPARATION_POINTS: readonly Point[] = [
  { x: 400, y: 82 }, { x: 560, y: 82 },
];
export const MEDICINE_DISPOSAL_POINT: Point = { x: 480, y: 82 };
export const MEDICINE_SURFACE_POINTS: readonly Point[] = [
  { x: 390, y: 125 }, { x: 450, y: 125 },
  { x: 510, y: 125 }, { x: 570, y: 125 },
];
export const MEDICINE_PREPARATION_MS = 2_000;

export interface MedicineDoseRecord {
  id: string;
  kind: MedicineKind;
  location: MedicineLocation;
  carrierId: string;
  slotIndex: number;
}

export interface MedicineInteractionRequest {
  targetId: string;
  expectedOccupantId: string;
  sequence: number;
  roundId: string;
}

export interface MedicineDiscardEvent {
  roundId: string;
  doseId: string;
  kind: MedicineKind;
}
