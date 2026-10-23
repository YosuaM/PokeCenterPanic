import { prepareFoliage } from './menuFoliage.js';
import type { FoliageRegion } from './menuFoliageModel.js';

export const TREE_WIND_SPEED = .95;

/** Masks follow the v2 tree artwork; branch attachments and patch borders stay pinned. */
export const REAR_TREE_WIND: readonly FoliageRegion[] = [
  { name: 'rear-left-crown', x: 155, y: 65, width: 95, height: 150,
    fronds: [{ root: [205, 200], tip: [205, 95], radius: 32, amplitude: 6.0 }] },
  { name: 'rear-chimney-crown', x: 260, y: 115, width: 65, height: 110,
    fronds: [{ root: [290, 215], tip: [290, 140], radius: 23, amplitude: 4.8 }] },
  { name: 'rear-roof-crown', x: 405, y: 110, width: 105, height: 140,
    fronds: [{ root: [452, 235], tip: [452, 135], radius: 36, amplitude: 6.6 }] },
  { name: 'rear-right-crown', x: 655, y: 185, width: 90, height: 130,
    fronds: [{ root: [704, 300], tip: [704, 210], radius: 30, amplitude: 6.0 }] },
  { name: 'rear-valley-crown', x: 750, y: 265, width: 90, height: 145,
    fronds: [{ root: [775, 395], tip: [775, 290], radius: 30, amplitude: 5.4 }] },
];

export const FOREGROUND_TREE_WIND: readonly FoliageRegion[] = [
  { name: 'left-branches', x: 35, y: 45, width: 135, height: 260, fronds: [
    { root: [45, 95], tip: [130, 110], radius: 26, amplitude: 7.2 },
    { root: [45, 205], tip: [140, 250], radius: 32, amplitude: 7.8 },
  ] },
  { name: 'right-upper-branches', x: 1400, y: 60, width: 235, height: 240, fronds: [
    { root: [1485, 280], tip: [1485, 145], radius: 40, amplitude: 7.2 },
    { root: [1620, 125], tip: [1530, 160], radius: 32, amplitude: 6.6 },
  ] },
  { name: 'right-lower-branches', x: 1210, y: 305, width: 430, height: 330, fronds: [
    { root: [1378, 470], tip: [1378, 320], radius: 45, amplitude: 7.5 },
    { root: [1595, 370], tip: [1470, 410], radius: 38, amplitude: 8.4 },
    { root: [1565, 485], tip: [1420, 555], radius: 40, amplitude: 7.8 },
    { root: [1350, 500], tip: [1250, 570], radius: 32, amplitude: 6.6 },
  ] },
];

export function createTreeWind(context: CanvasRenderingContext2D, source: ImageData,
  regions: readonly FoliageRegion[]) {
  const patches = regions.map(region => ({ region,
    deformation: prepareFoliage(region, source.data, source.width),
    image: context.createImageData(region.width, region.height),
  }));
  return (seconds: number) => {
    for (const { region, deformation, image } of patches) {
      deformation.render(image.data, seconds * TREE_WIND_SPEED);
      // Replace alpha as well as color, so moving silhouettes never leave a stationary ghost behind.
      context.putImageData(image, region.x, region.y);
    }
  };
}
