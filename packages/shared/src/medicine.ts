import type { Point } from './map.js';

export const MEDICINE_KINDS = ['burnHeal', 'antidote'] as const;
export type MedicineKind = typeof MEDICINE_KINDS[number];
export type MedicineLocation = 'carrier' | 'surface' | 'stock';

export const MEDICINE_PREPARATION_POINTS: readonly Point[] = [
  { x: 400, y: 58 }, { x: 560, y: 58 },
];
export const MEDICINE_DISPOSAL_POINT: Point = { x: 480, y: 58 };
export const MEDICINE_SURFACE_POINTS: readonly Point[] = [
  { x: 390, y: 132 }, { x: 450, y: 132 },
  { x: 510, y: 132 }, { x: 570, y: 132 },
];
export const MEDICINE_PREPARATION_MS = 2_000;
/** Prepared doses wait on their station's shelf; each station holds this many. */
export const MEDICINE_STOCK_CAPACITY = 3;
/** Releasing E sooner than this after pressing it at a station takes a dose instead of preparing one. */
export const MEDICINE_TAKE_TAP_MS = 250;

/** Global shelf slot of a station's position: Burn Heal uses 0–2 and Antidote 3–5, left to right. */
export function medicineStockSlot(station: number, position: number): number {
  return station * MEDICINE_STOCK_CAPACITY + position;
}

export function medicineStockStation(slot: number): number {
  return Math.floor(slot / MEDICINE_STOCK_CAPACITY);
}

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
