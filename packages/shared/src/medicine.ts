import type { Point } from './map.js';

export const MEDICINE_KINDS = ['burnHeal', 'antidote'] as const;
export type MedicineKind = typeof MEDICINE_KINDS[number];
export type MedicineLocation = 'carrier' | 'surface';

export const MEDICINE_PREPARATION_POINTS: readonly Point[] = [
  { x: 400, y: 322 }, { x: 560, y: 322 },
];
export const MEDICINE_DISPOSAL_POINT: Point = { x: 480, y: 322 };
export const MEDICINE_SURFACE_POINTS: readonly Point[] = [
  { x: 390, y: 365 }, { x: 450, y: 365 },
  { x: 510, y: 365 }, { x: 570, y: 365 },
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
