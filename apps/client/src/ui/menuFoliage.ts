import { ART_WIDTH } from './menuAtmosphereModel.js';
import { FOLIAGE, borderWeight, frondWeight, frondWind, type FoliageRegion } from './menuFoliageModel.js';

interface Influence { pixel: number; weight: number; flutter: number }

export function prepareFoliage(region: FoliageRegion, original: Uint8ClampedArray, sourceWidth = ART_WIDTH) {
  const { width, height } = region;
  const source = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const start = ((region.y + y) * sourceWidth + region.x) * 4;
    source.set(original.subarray(start, start + width * 4), y * width * 4);
  }
  const influences: Influence[][] = region.fronds.map(() => []);
  const coverage = new Float32Array(width * height);
  const moving: number[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const pixel = y * width + x;
    const rootDistance = Math.min(...region.fronds.map(f => Math.hypot(x + region.x - f.root[0], y + region.y - f.root[1])));
    const edge = borderWeight(region, x + region.x, y + region.y) * Math.max(0, Math.min(1, (rootDistance - 3) / 5));
    region.fronds.forEach((frond, i) => {
      const weight = frondWeight(frond, x + region.x, y + region.y) * edge;
      if (weight < .001) return;
      influences[i]!.push({ pixel, weight, flutter: weight * weight * Math.sin(x * .19 + y * .13) });
      coverage[pixel] = coverage[pixel]! + weight;
    });
    if (coverage[pixel]! > 0) moving.push(pixel);
  }
  const dx = new Float32Array(width * height), dy = new Float32Array(width * height);
  return {
    source,
    render(output: Uint8ClampedArray, seconds: number) {
      output.set(source);
      dx.fill(0); dy.fill(0);
      region.fronds.forEach((frond, i) => {
        const [bend, lift, flutter] = frondWind(seconds, frond, i);
        for (const influence of influences[i]!) {
          const { pixel, weight } = influence;
          const normalizer = Math.max(1, coverage[pixel]!);
          dx[pixel] = dx[pixel]! + (weight * bend + influence.flutter * flutter) / normalizer;
          dy[pixel] = dy[pixel]! + weight * lift / normalizer;
        }
      });
      // Inverse sampling bends the local texture continuously. Pinned borders retain exact source pixels.
      for (const pixel of moving) {
        const sx = Math.max(0, Math.min(width - 1.001, pixel % width - dx[pixel]!));
        const sy = Math.max(0, Math.min(height - 1.001, Math.floor(pixel / width) - dy[pixel]!));
        const x = Math.floor(sx), y = Math.floor(sy), fx = sx - x, fy = sy - y;
        const a = (y * width + x) * 4, b = a + width * 4;
        for (let channel = 0; channel < 4; channel++) {
          output[pixel * 4 + channel] =
            (source[a + channel]! * (1 - fx) + source[a + 4 + channel]! * fx) * (1 - fy) +
            (source[b + channel]! * (1 - fx) + source[b + 4 + channel]! * fx) * fy;
        }
      }
    },
  };
}

export function createFoliageLayers(document: Document, original: Uint8ClampedArray) {
  const allocated: HTMLCanvasElement[] = [];
  try {
    const layers = FOLIAGE.map(region => {
      const canvas = document.createElement('canvas');
      canvas.width = region.width; canvas.height = region.height;
      allocated.push(canvas);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Foliage canvas unavailable');
      return { region, canvas, context, image: context.createImageData(region.width, region.height),
        deformation: prepareFoliage(region, original) };
    });
    return {
      draw(context: CanvasRenderingContext2D, seconds: number) {
        for (const layer of layers) {
          layer.deformation.render(layer.image.data, seconds);
          layer.context.putImageData(layer.image, 0, 0);
          context.drawImage(layer.canvas, layer.region.x, layer.region.y);
        }
      },
      dispose() { layers.forEach(({ canvas }) => { canvas.width = canvas.height = 0; }); },
    };
  } catch (error) {
    allocated.forEach(canvas => { canvas.width = canvas.height = 0; });
    throw error;
  }
}
