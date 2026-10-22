import type { Region } from './menuAtmosphereModel.js';

export interface Frond {
  root: readonly [number, number];
  tip: readonly [number, number];
  radius: number;
  amplitude: number;
}
export interface FoliageRegion extends Region { name: string; fronds: readonly Frond[] }
const stem = (x: number, y: number, rootX: number, rootY: number, radius = 12, amplitude = 1.65): Frond =>
  ({ tip: [x, y], root: [rootX, rootY], radius, amplitude: Math.min(amplitude * 2.7, radius * .42) });

// Coordinates follow individual stems and lateral branches, never an entire shrub.
export const FOLIAGE: readonly FoliageRegion[] = [
  { name: 'foreground-daisies', x: 176, y: 797, width: 138, height: 109, fronds: [
    stem(201,815,210,850), stem(192,840,206,874), stem(226,851,230,886),
    stem(216,870,230,901), stem(272,854,270,885), stem(296,850,287,882), stem(248,833,250,872,10),
  ] },
  { name: 'pink-flowers', x: 683, y: 698, width: 204, height: 94, fronds: [
    stem(700,716,709,746,12), stem(717,737,724,773,15), stem(763,718,765,757,17),
    stem(799,735,790,767,13), stem(812,717,808,751,12), stem(829,736,827,756,12),
    stem(866,747,865,758,13,1.2), stem(798,760,790,790,14),
  ] },
  { name: 'left-planter-flowers', x: 252, y: 570, width: 143, height: 40, fronds: [
    stem(269,580,274,603,10,1.1), stem(315,582,316,607,12,1.3),
    stem(354,581,354,603,10,1.1), stem(378,594,379,609,10,1),
  ] },
  { name: 'right-planter-flowers', x: 601, y: 567, width: 122, height: 48, fronds: [
    stem(618,579,621,606,11,1.2), stem(645,592,645,614,11,1.1),
    stem(694,578,689,606,11,1.3), stem(704,599,701,614,10,1),
  ] },
  { name: 'left-tree-branches', x: 25, y: 200, width: 112, height: 103, fronds: [
    stem(105,236,35,245,18,2.3), stem(111,279,34,263,18,2.5), stem(89,211,35,224,15,2),
  ] },
  { name: 'midground-pine-branches', x: 820, y: 397, width: 177, height: 182, fronds: [
    stem(873,433,906,417,16,2.5), stem(939,441,906,420,17,2.5),
    stem(854,482,907,453,22,3), stem(953,494,906,462,22,3),
    stem(844,532,906,495,23,3.2), stem(978,551,907,512,23,3.2),
  ] },
  { name: 'central-pine-branches', x: 996, y: 590, width: 146, height: 134, fronds: [
    stem(1011,642,1068,623,18,2.3), stem(1112,641,1071,621,18,2.3),
    stem(1007,692,1071,662,20,2.5), stem(1125,701,1071,667,19,2.4),
  ] },
  { name: 'right-tree-branches', x: 1430, y: 335, width: 218, height: 297, fronds: [
    stem(1470,379,1595,352,25,2.5), stem(1500,441,1618,400,27,2.8),
    stem(1465,515,1608,457,27,2.7), stem(1494,599,1624,527,28,2.9),
  ] },
];
const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };

export function frondWeight(frond: Frond, x: number, y: number): number {
  const vx = frond.tip[0] - frond.root[0], vy = frond.tip[1] - frond.root[1];
  const length = Math.hypot(vx, vy);
  const along = ((x - frond.root[0]) * vx + (y - frond.root[1]) * vy) / length;
  const side = Math.abs((x - frond.root[0]) * vy - (y - frond.root[1]) * vx) / length;
  const width = frond.radius * (.45 + .55 * smooth(along / length));
  return smooth(along / length) * smooth((1 - side / width) / .8) *
    smooth(1 - Math.max(0, along - length) / frond.radius);
}

export function frondWind(seconds: number, frond: Frond, index: number): readonly [number, number, number] {
  const phase = index * 2.39996;
  const vx = frond.tip[0] - frond.root[0], vy = frond.tip[1] - frond.root[1];
  const length = Math.hypot(vx, vy);
  seconds *= length > 70 ? .62 : 1;
  const gust = .86 + .14 * Math.sin(seconds * .49);
  const breeze = Math.sin(seconds * 1.07 - frond.tip[0] * .002);
  const bend = frond.amplitude * gust * (.78 * breeze + .22 * Math.sin(seconds * 1.67 + phase));
  return [-vy / length * bend, vx / length * bend + frond.amplitude * .18 * Math.sin(seconds * 1.03 + phase),
    frond.amplitude * .2 * Math.sin(seconds * 2.6 + phase)];
}

export function borderWeight(region: Region, x: number, y: number): number {
  return smooth(Math.min(x - region.x, region.x + region.width - 1 - x,
    y - region.y, region.y + region.height - 1 - y) / 5);
}
