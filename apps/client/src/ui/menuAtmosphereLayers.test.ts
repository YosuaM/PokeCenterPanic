import { describe, expect, it, vi } from 'vitest';
import { createAtmosphereLayers } from './menuAtmosphereLayers.js';
import { ART_WIDTH, ART_HEIGHT, CLOUDS, SMOKE } from './menuAtmosphereModel.js';

function setup(failAt = -1) {
  const canvases: ReturnType<typeof canvas>[] = [];
  function canvas() {
    let source = '';
    const context = {
      globalCompositeOperation: 'source-over', globalAlpha: 1,
      putImageData: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
      lineTo: vi.fn(), closePath: vi.fn(), clip: vi.fn(), fillRect: vi.fn(),
      save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), fillStyle: '',
      createRadialGradient: () => ({ addColorStop: vi.fn() }),
      drawImage: vi.fn<(image: { source?: string }, ...area: number[]) => void>((image) => { if (image.source) source = image.source; }),
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      getImageData: () => {
        const data = new Uint8ClampedArray(ART_WIDTH * ART_HEIGHT * 4);
        if (source === 'original') {
          for (const [x, y, r, g, b] of [[200,175,140,130,170], [500,100,130,95,180], [501,100,20,30,65], [600,100,245,245,255]] as const) {
            data.set([r,g,b,255], (y * ART_WIDTH + x) * 4);
          }
        }
        return { data };
      },
    };
    return { width: 0, height: 0, context, getContext: () => context };
  }
  const document = { createElement: () => {
    const result = canvas(); canvases.push(result);
    if (canvases.length === failAt) result.getContext = () => null as unknown as typeof result.context;
    return result;
  } };
  return { document, canvases, canvas };
}
const original = { source: 'original' } as unknown as CanvasImageSource;
const plate = { source: 'plate' } as unknown as CanvasImageSource;

describe('independent original-art layers', () => {
  it('keeps smoke out of cloud sprites and preserves tree/star occlusion', () => {
    const s = setup();
    const layers = createAtmosphereLayers(s.document as unknown as Document, original, plate);
    const cloud = s.canvases.find(c => c.width === CLOUDS[0]!.width && c.height === CLOUDS[0]!.height)!;
    const alpha = (canvas: typeof cloud, x: number, y: number) =>
      canvas.context.putImageData.mock.calls[0]![0]!.data[(y * canvas.width + x) * 4 + 3];
    expect(alpha(cloud, 200 - CLOUDS[0]!.x, 175)).toBe(0);
    expect(alpha(cloud, 500 - CLOUDS[0]!.x, 100)).toBe(255);
    const smoke = s.canvases.find(c => c.width === SMOKE.width)!;
    expect(alpha(smoke, 200 - SMOKE.x, 175 - SMOKE.y)).toBe(255);
    const foreground = s.canvases.filter(c => c.height === 400).at(-2)!;
    expect(alpha(foreground, 200, 175)).toBe(0);
    expect(alpha(foreground, 501, 100)).toBe(255);
    expect(alpha(foreground, 600, 100)).toBe(255);
    layers.dispose();
  });
  it('keeps the scene fixed and never rotates vegetation as rigid sprites', () => {
    const s = setup(); const target = s.canvas();
    const layers = createAtmosphereLayers(s.document as unknown as Document, original, plate);
    layers.draw(target.context as unknown as CanvasRenderingContext2D, 0);
    const base = target.context.drawImage.mock.calls[0];
    target.context.drawImage.mockClear(); target.context.rotate.mockClear();
    layers.draw(target.context as unknown as CanvasRenderingContext2D, 7);
    expect(target.context.drawImage.mock.calls[0]).toEqual(base);
    expect(target.context.rotate).not.toHaveBeenCalled();
    expect(target.context.translate).not.toHaveBeenCalled();
    expect(s.canvases.every(c => c.context.clip.mock.calls.length === 0)).toBe(true);
    expect(target.context.globalAlpha).toBe(1);
    expect(target.context.globalCompositeOperation).toBe('source-over');
    layers.dispose();
    expect(s.canvases.every(c => c.width === 0 && c.height === 0)).toBe(true);
  });
  it('paints flyers in front of the clouds but behind foreground branches and stars', () => {
    const s = setup(); const target = s.canvas();
    const layers = createAtmosphereLayers(s.document as unknown as Document, original, plate);
    const foreground = s.canvases.filter(c => c.height === 400).at(-2)!;
    const cloudImages = s.canvases.filter(c => CLOUDS.some(r => r.width === c.width && r.height === c.height));
    const sky = vi.fn((context: CanvasRenderingContext2D) => {
      expect(context.globalCompositeOperation).toBe('source-over');
      return null;
    });
    layers.draw(target.context as unknown as CanvasRenderingContext2D, 3, sky);
    expect(sky).toHaveBeenCalledExactlyOnceWith(target.context);
    const order = (image: unknown) => target.context.drawImage.mock.invocationCallOrder[
      target.context.drawImage.mock.calls.findIndex(([drawn]) => drawn === image)]!;
    const skyOrder = sky.mock.invocationCallOrder[0]!;
    expect(cloudImages.every(cloud => order(cloud) < skyOrder)).toBe(true);
    expect(skyOrder).toBeLessThan(order(foreground));
    // Nobody flew, so no scenery is repainted over the sky.
    expect(target.context.drawImage.mock.calls.some((call) => call.length === 9)).toBe(false);
    layers.dispose();
  });
  it('repaints the scenery below the horizon over the area a flyer covered, clipped to the sky', () => {
    const s = setup(); const target = s.canvas();
    const layers = createAtmosphereLayers(s.document as unknown as Document, original, plate);
    const foreground = s.canvases.filter(c => c.height === 400).at(-2)!;
    const sky = vi.fn(() => ({ x: -20.5, y: 350.2, width: 100, height: 80 }));
    layers.draw(target.context as unknown as CanvasRenderingContext2D, 3, sky);
    const repaint = target.context.drawImage.mock.calls.findIndex((call) => call.length === 9);
    expect(target.context.drawImage.mock.calls[repaint]!.slice(1)).toEqual([0, 350, 80, 50, 0, 350, 80, 50]);
    expect(target.context.drawImage.mock.calls[repaint]![0]).toBe(s.canvases.filter(c => c.height === 400).at(-1));
    const order = target.context.drawImage.mock.invocationCallOrder;
    expect(sky.mock.invocationCallOrder[0]!).toBeLessThan(order[repaint]!);
    expect(order[repaint]!).toBeLessThan(order[target.context.drawImage.mock.calls.findIndex(([image]) => image === foreground)]!);
    target.context.drawImage.mockClear();
    layers.draw(target.context as unknown as CanvasRenderingContext2D, 3, () => ({ x: 10, y: 420, width: 50, height: 30 }));
    expect(target.context.drawImage.mock.calls.some((call) => call.length === 9)).toBe(false);
    layers.dispose();
  });
  it('releases allocated surfaces when preparation fails', () => {
    const s = setup(5);
    expect(() => createAtmosphereLayers(s.document as unknown as Document, original, plate)).toThrow('Foliage canvas unavailable');
    expect(s.canvases.every(c => c.width === 0 && c.height === 0)).toBe(true);
  });
});
