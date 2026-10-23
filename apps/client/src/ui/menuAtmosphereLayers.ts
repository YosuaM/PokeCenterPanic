import { ART_WIDTH, ART_HEIGHT, CHIMNEY, SMOKE, SMOKE_COUNT, LIGHTS,
  smokePuff, lightStrength } from './menuAtmosphereModel.js';
import { CLOUD_ART_BANDS, cloudOffset } from './menuCloudsModel.js';

export interface AtmosphereArt {
  landscape: CanvasImageSource;
  clouds: CanvasImageSource;
  rearTrees: CanvasImageSource;
  clinic: CanvasImageSource;
  trees: CanvasImageSource;
  smoke: CanvasImageSource;
}
export interface AtmosphereActors {
  sky?(context: CanvasRenderingContext2D): void;
  ground?(context: CanvasRenderingContext2D): void;
}
export interface AtmosphereLayers {
  draw(context: CanvasRenderingContext2D, seconds: number, actors?: AtmosphereActors): void;
  dispose(): void;
}

export function createAtmosphereLayers(document: Document, art: AtmosphereArt): AtmosphereLayers {
  const surfaces: HTMLCanvasElement[] = [];
  let disposed = false;
  const surface = (width = ART_WIDTH, height = ART_HEIGHT) => {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    surfaces.push(canvas);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Atmosphere canvas unavailable');
    return { canvas, context };
  };
  const dispose = () => { disposed = true; surfaces.forEach(canvas => { canvas.width = canvas.height = 0; }); };
  try {
    const occluder = (image: CanvasImageSource) => {
      const { canvas, context } = surface();
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, ART_WIDTH, ART_HEIGHT);
      // Generated interiors have alpha 252–254; make them solid while retaining branch-edge transparency.
      for (let i = 3; i < pixels.data.length; i += 4) if (pixels.data[i]! >= 240) pixels.data[i] = 255;
      context.putImageData(pixels, 0, 0);
      return canvas;
    };
    const clinic = occluder(art.clinic), trees = occluder(art.trees), rearTrees = occluder(art.rearTrees);
    const halo = surface(96, 96);
    const gradient = halo.context.createRadialGradient(48, 48, 0, 48, 48, 48);
    gradient.addColorStop(0, 'rgba(255,207,103,1)');
    gradient.addColorStop(.22, 'rgba(255,165,59,.55)');
    gradient.addColorStop(1, 'rgba(255,133,30,0)');
    halo.context.fillStyle = gradient;
    halo.context.fillRect(0, 0, 96, 96);
    return {
      draw(context, seconds, actors) {
        if (disposed) return;
        context.save();
        try {
          context.globalAlpha = 1;
          context.globalCompositeOperation = 'source-over';
          context.imageSmoothingEnabled = true;
          context.clearRect(0, 0, ART_WIDTH, ART_HEIGHT);
          context.drawImage(art.landscape, 0, 0);
          for (const band of CLOUD_ART_BANDS) {
            const x = cloudOffset(seconds, band.loopSeconds);
            context.globalAlpha = band.alpha;
            for (const left of [x - ART_WIDTH, x]) {
              context.drawImage(art.clouds, 0, band.top, ART_WIDTH, band.height,
                left, band.top, ART_WIDTH, band.height);
            }
          }
          context.globalAlpha = 1;
          const drawActors = (draw?: (context: CanvasRenderingContext2D) => void) => {
            context.save();
            try { draw?.(context); } finally { context.restore(); }
          };
          drawActors(actors?.sky);
          context.drawImage(rearTrees, 0, 0);
          context.drawImage(clinic, 0, 0);
          context.globalCompositeOperation = 'screen';
          LIGHTS.forEach(({ x, y, radius }, index) => {
            context.globalAlpha = lightStrength(seconds, index);
            context.drawImage(halo.canvas, x - radius, y - radius, radius * 2, radius * 2);
          });
          context.globalAlpha = 1;
          context.globalCompositeOperation = 'source-over';
          drawActors(actors?.ground);
          context.drawImage(trees, 0, 0);
          for (let i = 0; i < SMOKE_COUNT; i++) {
            const puff = smokePuff(seconds, i);
            context.globalAlpha = puff.opacity;
            context.drawImage(art.smoke, SMOKE.x, SMOKE.y, SMOKE.width, SMOKE.height,
              puff.x - (CHIMNEY.x - SMOKE.x) * puff.scale, puff.y - (CHIMNEY.y - SMOKE.y) * puff.scale,
              SMOKE.width * puff.scale, SMOKE.height * puff.scale);
          }
        } finally { context.restore(); }
      },
      dispose,
    };
  } catch (error) { dispose(); throw error; }
}
