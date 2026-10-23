import { ART_WIDTH } from './menuAtmosphereModel.js';

/** Non-overlapping strips in the painted cloud overlay, with preserved parallax speeds. */
export const CLOUD_ART_BANDS = [
  { top: 0, height: 165, loopSeconds: 170, alpha: 1 },
  { top: 165, height: 90, loopSeconds: 270, alpha: .9 },
  { top: 255, height: 105, loopSeconds: 420, alpha: .7 },
] as const;

/** Art pixels per cloud cell; matches the chunky pixel scale of the painted scene. */
export const CLOUD_PIXEL = 4;
export const CLOUD_COLUMNS = ART_WIDTH / CLOUD_PIXEL;
export type CloudPalette = readonly [rim: string, upper: string, middle: string, lower: string, underside: string];
export interface CloudBand {
  /** Art-space y of the band's first cell row. */
  top: number;
  rows: number;
  loopSeconds: number;
  alpha: number;
  seed: number;
  count: number;
  /** Typical cloud length in cells. */
  length: number;
  palette: CloudPalette;
}
export interface CloudPuff { x: number; y: number; radius: number }
export interface CloudStreak { x: number; y: number; halfLength: number; halfHeight: number }
/** Puffs are listed back to front; streaks are the thin flat wisps beneath and beside them. */
export interface CloudShape { base: number; puffs: readonly CloudPuff[]; streaks: readonly CloudStreak[] }

/** Back to front: smaller, cooler and slower clouds sit farther away so the bands drift with parallax. */
export const CLOUD_BANDS: readonly CloudBand[] = [
  { top: 196, rows: 28, loopSeconds: 420, alpha: .7, seed: 7, count: 6, length: 34,
    palette: ['#b7a3e8', '#7c6ac8', '#9175c9', '#ad80c4', '#d395ad'] },
  { top: 104, rows: 38, loopSeconds: 270, alpha: .9, seed: 19, count: 5, length: 52,
    palette: ['#dcc4f2', '#9a80d8', '#b885cf', '#d891c0', '#f2aaa6'] },
  { top: 16, rows: 50, loopSeconds: 170, alpha: 1, seed: 41, count: 4, length: 74,
    palette: ['#f6defa', '#ad8fe2', '#d398d6', '#f0a2c0', '#ffc59d'] },
];

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;
const PUFF_STRETCH = 1.7;

/** Rightward tile translation; drawing the tile at offset and offset − width hides the wrap. */
export function cloudOffset(seconds: number, loopSeconds: number): number {
  return ((seconds % loopSeconds + loopSeconds) % loopSeconds) / loopSeconds * ART_WIDTH;
}

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = state + 0x6d2b79f5 >>> 0;
    let t = Math.imul(state ^ state >>> 15, state | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function cloudShapes(band: CloudBand): CloudShape[] {
  const next = random(band.seed);
  const spacing = CLOUD_COLUMNS / band.count;
  return Array.from({ length: band.count }, (_, index) => {
    const length = band.length * (.7 + next() * .5);
    const maxRadius = Math.min(band.length * .16, (band.rows - 3) / 1.45);
    const base = Math.round(maxRadius * 1.4 + 1 + next() * (band.rows - 3 - maxRadius * 1.4));
    const x = (index + .25 + next() * .5) * spacing;
    const count = 5 + Math.floor(next() * 4);
    const puffs = Array.from({ length: count }, () => {
      const t = next();
      // Taller lobes cluster near the middle and the body leans slightly so silhouettes differ.
      const radius = Math.max(1.5, maxRadius * (1 - Math.abs(t - .45) * 1.5) * (.55 + next() * .45));
      return { x: x - length * .4 + length * .8 * t, y: base - radius * .45, radius };
    }).sort((a, b) => b.radius - a.radius);
    const streaks = [
      { x, y: base - 1, halfLength: length * .62, halfHeight: 1.6 },
      { x: x + (next() - .3) * length * .5, y: base - 3 - next() * 2, halfLength: length * (.25 + next() * .2), halfHeight: 1 },
    ];
    return { base, puffs, streaks };
  });
}

const wrapped = (dx: number) => ((dx % CLOUD_COLUMNS) + CLOUD_COLUMNS * 1.5) % CLOUD_COLUMNS - CLOUD_COLUMNS / 2;
const STREAK = -2, EMPTY = -1;

/** Hard-edged cells for a band: 0 is empty, 1–5 index the palette (+1). Columns wrap so the tile repeats seamlessly. */
export function cloudCells(band: CloudBand, shapes = cloudShapes(band)): Uint8Array {
  const puffs = shapes.flatMap(shape => shape.puffs.map(puff => ({ ...puff, base: shape.base })));
  // Front-most puff covering each cell, so overlapping lobes keep their own rim and gradient.
  const owner = new Int16Array(CLOUD_COLUMNS * band.rows).fill(EMPTY);
  for (let y = 0; y < band.rows; y++) {
    for (let x = 0; x < CLOUD_COLUMNS; x++) {
      const cy = y + .5, cx = x + .5, index = y * CLOUD_COLUMNS + x;
      if (shapes.some(({ streaks }) => streaks.some(streak =>
        (wrapped(cx - streak.x) / streak.halfLength) ** 2 + ((cy - streak.y) / streak.halfHeight) ** 2 <= 1))) owner[index] = STREAK;
      puffs.forEach((puff, id) => {
        if (cy <= puff.base && (wrapped(cx - puff.x) / (puff.radius * PUFF_STRETCH)) ** 2 + ((cy - puff.y) / puff.radius) ** 2 <= 1) owner[index] = id;
      });
    }
  }
  const cells = new Uint8Array(owner.length);
  owner.forEach((id, index) => {
    if (id === EMPTY) return;
    const x = index % CLOUD_COLUMNS, y = (index - x) / CLOUD_COLUMNS;
    const above = y > 0 ? owner[index - CLOUD_COLUMNS]! : EMPTY;
    const below = y < band.rows - 1 ? owner[index + CLOUD_COLUMNS]! : EMPTY;
    let shade: number;
    if (below === EMPTY) shade = 4;
    else if (id === STREAK) shade = above === EMPTY ? 2 : 3;
    else if (above < id) shade = 0;
    else {
      const puff = puffs[id]!, top = puff.y - puff.radius;
      // Ordered dithering blends the lavender top into the sunset-lit pink base.
      const depth = (y + .5 - top) / (puff.base - top) * 3 + (BAYER[(y % 4) * 4 + x % 4]! / 16 - .5) * .9;
      shade = 1 + Math.min(2, Math.max(0, Math.floor(depth)));
    }
    cells[index] = shade + 1;
  });
  return cells;
}
