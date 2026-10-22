export const ART_WIDTH = 1672;
export const ART_HEIGHT = 941;
export type Pixel = readonly [number, number, number];
export interface Region { x: number; y: number; width: number; height: number }

export const CLOUDS: readonly Region[] = [
  { x: 0, y: 0, width: ART_WIDTH, height: 180 },
  { x: 0, y: 140, width: ART_WIDTH, height: 160 },
  { x: 0, y: 260, width: ART_WIDTH, height: 140 },
];
const SKYLINE: readonly (readonly [number, number])[] = [
  [0,150],[180,150],[200,210],[260,235],[350,240],[420,245],[500,218],
  [640,305],[730,310],[780,275],[875,305],[896,288],[955,321],[1010,301],
  [1075,334],[1115,330],[1180,366],[1245,375],[1300,383],[1340,375],
  [1400,316],[1450,216],[1530,76],[1672,70],
];
export function inSky(x: number, y: number): boolean {
  for (let i = 1; i < SKYLINE.length; i++) {
    const [ax,ay] = SKYLINE[i - 1]!, [bx,by] = SKYLINE[i]!;
    if (x <= bx) return y < ay + (by - ay) * (x - ax) / (bx - ax);
  }
  return false;
}
export function cloudBandWeight(y: number, index: number): number {
  const r = CLOUDS[index]!;
  const top = index === 0 ? 1 : Math.min(1, (y - r.y) / 40);
  const bottom = index === CLOUDS.length - 1 ? 1 : Math.min(1, (r.y + r.height - y) / 40);
  return Math.max(0, Math.min(top, bottom));
}
export const SMOKE: Region = { x: 125, y: 125, width: 123, height: 94 };
export const LIGHTS = [
  { x: 111, y: 756, radius: 52 }, { x: 233, y: 625, radius: 27 },
  { x: 576, y: 664, radius: 36 }, { x: 827, y: 558, radius: 22 },
  { x: 911, y: 617, radius: 19 }, { x: 415, y: 502, radius: 18 },
  { x: 578, y: 502, radius: 18 }, { x: 487, y: 532, radius: 65 },
] as const;

export function cloudPixel(original: Pixel, plate: Pixel): boolean {
  return original[0] - plate[0] > 14 && original[1] - plate[1] > 4 &&
    original[2] > 85 && original[0] > original[1] * .85;
}
export function smokePixel(original: Pixel, plate: Pixel): boolean {
  return original[0] - plate[0] > 24 && original[0] > 65 && original[1] > 60 &&
    original[1] > original[0] * .8;
}
export function skyOccluder([r, g, b]: Pixel): boolean {
  return (r < 65 && g < 100 && b < 112) || (r < g && b < g * 1.8 && b < 180) ||
    (r > 195 && g > 195 && b > 205);
}
export function cloudOffset(seconds: number, index: number): number {
  const phase = index * .7;
  return Math.sin(seconds * .035) * 70 + (Math.sin(seconds * .055 + phase) - Math.sin(phase)) * 3;
}
export function smokePuff(seconds: number, index: number) {
  const age = ((seconds + index * 1.3) % 10) / 10;
  return {
    x: 226 - age * 25 + Math.sin(age * 5 + seconds * .2) * age * 4,
    y: 218 - age * 57,
    scale: .28 + age * .75,
    opacity: Math.sin(Math.PI * age) * .18,
  };
}
export function lightStrength(seconds: number, index: number): number {
  return .1 + .05 * Math.sin(seconds * 1.9 + index * 1.7) +
    .02 * Math.sin(seconds * 4.1 + index * .9);
}
