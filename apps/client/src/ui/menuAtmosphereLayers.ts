import { createFoliageLayers } from './menuFoliage.js';
import { ART_WIDTH, ART_HEIGHT, CLOUDS, SMOKE, LIGHTS,
  cloudPixel, smokePixel, skyOccluder, inSky, cloudBandWeight, cloudOffset, smokePuff, lightStrength,
  type Region, type Pixel } from './menuAtmosphereModel.js';

interface Layer { image: HTMLCanvasElement; region: Region }
export interface AtmosphereLayers {
  draw(context: CanvasRenderingContext2D, seconds: number): void;
  dispose(): void;
}

export function createAtmosphereLayers(document: Document, original: CanvasImageSource,
  plate: CanvasImageSource): AtmosphereLayers {
  const surfaces: HTMLCanvasElement[] = [];
  let foliage: ReturnType<typeof createFoliageLayers> | undefined;
  const surface = (width = ART_WIDTH, height = ART_HEIGHT) => {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    surfaces.push(canvas);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    return { canvas, context };
  };
  try {
    const source = surface();
    const clean = surface();
    source.context.drawImage(original, 0, 0, ART_WIDTH, ART_HEIGHT);
    clean.context.drawImage(plate, 0, 0, ART_WIDTH, ART_HEIGHT);
    const pixels = source.context.getImageData(0, 0, ART_WIDTH, ART_HEIGHT);
    const behind = clean.context.getImageData(0, 0, ART_WIDTH, ART_HEIGHT);
    foliage = createFoliageLayers(document, pixels.data);
    const rgb = (data: Uint8ClampedArray, index: number): Pixel => [data[index]!, data[index + 1]!, data[index + 2]!];
    const cutout = (region: Region, select: (a: Pixel, b: Pixel, x: number, y: number) => boolean, feather = 0, residual = false, opacity: (y: number) => number = () => 1): Layer => {
      const target = surface(region.width, region.height);
      const image = target.context.createImageData(region.width, region.height);
      for (let y = 0; y < region.height; y++) for (let x = 0; x < region.width; x++) {
        const from = ((region.y + y) * ART_WIDTH + region.x + x) * 4;
        const to = (y * region.width + x) * 4;
        if (!select(rgb(pixels.data, from), rgb(behind.data, from), region.x + x, region.y + y)) continue;
        image.data.set(pixels.data.subarray(from, from + 4), to);
        if (residual) for (let channel = 0; channel < 3; channel++) {
          const background = behind.data[from + channel]!;
          image.data[to + channel] = Math.max(0, pixels.data[from + channel]! - background) * 255 / Math.max(1, 255 - background);
        }
        image.data[to + 3] = Math.round(image.data[to + 3]! * opacity(region.y + y));
        if (feather) {
          const edge = Math.min(x, region.width - x - 1, region.y === 0 ? feather : y, region.height - y - 1);
          image.data[to + 3] = Math.round(255 * Math.min(1, edge / feather));
        }
      }
      target.context.putImageData(image, 0, 0);
      return { image: target.canvas, region };
    };
    const inSmoke = (x: number, y: number) => x >= SMOKE.x && x < SMOKE.x + SMOKE.width &&
      y >= SMOKE.y && y < SMOKE.y + SMOKE.height;
    const clouds = CLOUDS.map((region, index) => cutout(region,
      (a, b, x, y) => inSky(x,y) && !inSmoke(x,y) && !skyOccluder(a) && cloudPixel(a,b),
      0, true, y => cloudBandWeight(y,index)));
    const skyRegion = { x: 0, y: 0, width: ART_WIDTH, height: 400 };
    const skyMask = cutout(skyRegion, (a, _b, x, y) => inSky(x,y) && !skyOccluder(a) && !inSmoke(x,y));
    const smoke = cutout(SMOKE, smokePixel);
    const smokeMask = cutout(SMOKE, () => true, 8);
    const base = surface();
    base.context.drawImage(source.canvas, 0, 0);
    base.context.globalCompositeOperation = 'destination-out';
    for (const { image, region } of [skyMask, smokeMask]) base.context.drawImage(image, region.x, region.y);
    base.context.globalCompositeOperation = 'destination-over';
    base.context.drawImage(clean.canvas, 0, 0);
    // Foreground branches and stars must stay in front of drifting cloud sprites.
    const occlusion = cutout(skyRegion, (a, _b, x, y) => (!inSky(x,y) || skyOccluder(a)) && !inSmoke(x, y));
    const halo = surface(96, 96);
    const gradient = halo.context.createRadialGradient(48, 48, 0, 48, 48, 48);
    gradient.addColorStop(0, 'rgba(255,207,103,1)');
    gradient.addColorStop(.22, 'rgba(255,165,59,.55)');
    gradient.addColorStop(1, 'rgba(255,133,30,0)');
    halo.context.fillStyle = gradient;
    halo.context.fillRect(0, 0, 96, 96);
    return {
      draw(context, seconds) {
        context.clearRect(0, 0, ART_WIDTH, ART_HEIGHT);
        context.drawImage(base.canvas, 0, 0);
        context.globalCompositeOperation = 'screen';
        for (const [index, { image, region }] of clouds.entries()) {
          context.drawImage(image, region.x + cloudOffset(seconds, index), region.y);
        }
        context.globalCompositeOperation = 'source-over';
        context.drawImage(occlusion.image, 0, 0);
        foliage!.draw(context, seconds);
        for (let i = 0; i < 8; i++) {
          const puff = smokePuff(seconds, i);
          context.globalAlpha = puff.opacity;
          const width = SMOKE.width * puff.scale, height = SMOKE.height * puff.scale;
          context.drawImage(smoke.image, puff.x - width * .82, puff.y - height, width, height);
        }
        context.globalCompositeOperation = 'screen';
        LIGHTS.forEach(({ x, y, radius }, index) => {
          context.globalAlpha = lightStrength(seconds, index);
          context.drawImage(halo.canvas, x - radius, y - radius, radius * 2, radius * 2);
        });
        context.globalAlpha = 1;
        context.globalCompositeOperation = 'source-over';
      },
      dispose() { foliage?.dispose(); surfaces.forEach(canvas => { canvas.width = canvas.height = 0; }); },
    };
  } catch (error) {
    foliage?.dispose();
    surfaces.forEach(canvas => { canvas.width = canvas.height = 0; });
    throw error;
  }
}
