import { DISCHARGE_POSITION, HEALING_MACHINE_FOOTPRINTS, MEDICINE_TABLE_BOUNDS,
  RECEPTION_COUNTER_BOUNDS, RECEPTION_SLOT_POSITIONS, RECOVERY_AREA_BOUNDS,
  WAITING_BENCHES, WAITING_SEATS_PER_BENCH, WAITING_SLOT_POSITIONS,
  type MapObstacle, type Point } from './map.js';
import { MEDICINE_DISPOSAL_POINT, MEDICINE_PREPARATION_POINTS } from './medicine.js';

function slotBounds(station: MapObstacle, slots: readonly Point[], index: number): MapObstacle {
  const left = index === 0 ? station.x : (slots[index - 1]!.x + slots[index]!.x) / 2;
  const right = index === slots.length - 1 ? station.x + station.width :
    (slots[index]!.x + slots[index + 1]!.x) / 2;
  return { x: left, y: station.y, width: right - left, height: station.height };
}

// Discharge sits between the arrival slots, so split the counter in left-to-right order.
const counterSlots = [...RECEPTION_SLOT_POSITIONS, DISCHARGE_POSITION];
const counterOrder = counterSlots.map((_, index) => index).sort((a, b) => counterSlots[a]!.x - counterSlots[b]!.x);
const orderedCounterSlots = counterOrder.map((index) => counterSlots[index]!);
const counterBounds: MapObstacle[] = [];
counterOrder.forEach((slot, order) => {
  counterBounds[slot] = slotBounds(RECEPTION_COUNTER_BOUNDS, orderedCounterSlots, order);
});
const receptionBounds = counterBounds.slice(0, -1);
const waitingBounds = WAITING_SLOT_POSITIONS.map((_, index) => {
  const benchIndex = Math.floor(index / WAITING_SEATS_PER_BENCH);
  const start = benchIndex * WAITING_SEATS_PER_BENCH;
  return slotBounds(WAITING_BENCHES[benchIndex]!,
    WAITING_SLOT_POSITIONS.slice(start, start + WAITING_SEATS_PER_BENCH), index - start);
});
const pharmacySlots = [MEDICINE_PREPARATION_POINTS[0]!, MEDICINE_DISPOSAL_POINT,
  MEDICINE_PREPARATION_POINTS[1]!];
const pharmacyBounds = pharmacySlots.map((_, index) => slotBounds(MEDICINE_TABLE_BOUNDS, pharmacySlots, index));

export function stationInteractionBounds(targetId: string): MapObstacle | undefined {
  const id = targetId.startsWith('medicine:apply:') ? targetId.slice('medicine:apply:'.length) : targetId;
  const machine = /^healing:([01])$/.exec(id);
  if (machine) return HEALING_MACHINE_FOOTPRINTS[Number(machine[1])];
  if (id === 'recovery') return RECOVERY_AREA_BOUNDS;
  if (id === 'discharge') return counterBounds.at(-1);
  if (id === 'medicine:disposal') return pharmacyBounds[1];
  const slot = /^(reception|waiting):(0|[1-9]\d*)$/.exec(id);
  if (slot) return (slot[1] === 'reception' ? receptionBounds : waitingBounds)[Number(slot[2])];
  const preparation = /^medicine:prep:([01])$/.exec(id);
  return preparation ? pharmacyBounds[Number(preparation[1]) * 2] : undefined;
}
