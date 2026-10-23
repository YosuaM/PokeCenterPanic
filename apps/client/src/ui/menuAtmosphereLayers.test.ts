import { CLOUD_ART_BANDS } from './menuCloudsModel.js';
import { describe, expect, it, vi } from 'vitest';
import { createAtmosphereLayers, type AtmosphereArt } from './menuAtmosphereLayers.js';
import { ART_WIDTH, CHIMNEY, SMOKE, SMOKE_COUNT } from './menuAtmosphereModel.js';

const art = Object.fromEntries(['landscape', 'clouds', 'rearTrees', 'clinic', 'trees', 'smoke'].map(name => [name, { name }])) as unknown as AtmosphereArt;
function setup(failAt = -1) {
  const canvases: ReturnType<typeof canvas>[] = [];
  function canvas() {
    const context = {
      globalAlpha: 1, globalCompositeOperation: 'source-over', imageSmoothingEnabled: true,
      save: vi.fn(), restore: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), fillStyle: '',
      drawImage: vi.fn(), putImageData: vi.fn(),
      getImageData: () => ({ width: ART_WIDTH, data: new Uint8ClampedArray([20, 30, 40, 253, 20, 30, 40, 0, 20, 30, 40, 128]) }),
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      createRadialGradient: () => ({ addColorStop: vi.fn() }),
    };
    return { width: 0, height: 0, context, getContext: () => context };
  }
  const document = { createElement: () => {
    const result = canvas(); canvases.push(result);
    if (canvases.length === failAt) result.getContext = () => null as unknown as typeof result.context;
    return result;
  } };
  return { document: document as unknown as Document, canvases, target: canvas().context };
}

describe('registered scene compositing', () => {
  it('covers Lugia with rear trees and the clinic, and walkers with foreground trees only', () => {
    const s = setup(); const layers = createAtmosphereLayers(s.document, art);
    const sky = vi.fn(), ground = vi.fn();
    layers.draw(s.target as unknown as CanvasRenderingContext2D, 3, { sky, ground });
    const order = (image: unknown) => s.target.drawImage.mock.invocationCallOrder[
      s.target.drawImage.mock.calls.findIndex(([drawn]) => drawn === image)]!;
    expect(order(art.clouds)).toBeLessThan(sky.mock.invocationCallOrder[0]!);
    expect(sky.mock.invocationCallOrder[0]!).toBeLessThan(order(s.canvases[2]));
    expect(order(s.canvases[2])).toBeLessThan(order(s.canvases[0]));
    expect(s.canvases[2]!.context.drawImage).toHaveBeenCalledWith(art.rearTrees, 0, 0);
    expect(order(s.canvases[0])).toBeLessThan(ground.mock.invocationCallOrder[0]!);
    expect(ground.mock.invocationCallOrder[0]!).toBeLessThan(order(s.canvases[1]));
    expect(order(s.canvases[1])).toBeLessThan(order(art.smoke));
    expect(sky).toHaveBeenCalledExactlyOnceWith(s.target);
    expect(ground).toHaveBeenCalledExactlyOnceWith(s.target);
  });
  it('loops every painted strip without scaling, vertical movement or a wrap gap', () => {
    const s = setup(); const layers = createAtmosphereLayers(s.document, art);
    const cycles = CLOUD_ART_BANDS.map(band => band.loopSeconds);
    for (const time of [0, 85, ...cycles.flatMap(cycle => [cycle - .001, cycle, cycle + .001])]) {
      s.target.drawImage.mockClear();
      const sky = vi.fn();
      layers.draw(s.target as unknown as CanvasRenderingContext2D, time, { sky });
      const clouds = s.target.drawImage.mock.calls.filter(([image]) => image === art.clouds);
      expect(clouds).toHaveLength(CLOUD_ART_BANDS.length * 2);
      CLOUD_ART_BANDS.forEach((band, index) => {
        const left = clouds[index * 2]!, right = clouds[index * 2 + 1]!;
        expect(left.slice(1, 5)).toEqual([0, band.top, ART_WIDTH, band.height]);
        expect(right.slice(1, 5)).toEqual(left.slice(1, 5));
        expect(left.slice(6)).toEqual([band.top, ART_WIDTH, band.height]);
        expect(right.slice(6)).toEqual(left.slice(6));
        expect(left[5] + ART_WIDTH).toBeCloseTo(right[5]);
        expect(left[5]).toBeLessThanOrEqual(0);
        expect(right[5] + ART_WIDTH).toBeGreaterThanOrEqual(ART_WIDTH);
      });
      const indices = s.target.drawImage.mock.calls.flatMap(([image], i) => image === art.clouds ? [i] : []);
      expect(indices.every(i => s.target.drawImage.mock.invocationCallOrder[i]! < sky.mock.invocationCallOrder[0]!)).toBe(true);
    }
    layers.dispose();
  });
  it('makes tree and building interiors opaque without closing branch gaps or hardening soft edges', () => {
    const s = setup(); createAtmosphereLayers(s.document, art);
    for (const canvas of s.canvases.slice(0, 3)) {
      const pixels = canvas.context.putImageData.mock.calls[0]![0].data as Uint8ClampedArray;
      expect([...pixels]).toEqual([20, 30, 40, 255, 20, 30, 40, 0, 20, 30, 40, 128]);
      const compositeRed = (index: number) => pixels[index]! * pixels[index + 3]! / 255 + 255 * (1 - pixels[index + 3]! / 255);
      expect(compositeRed(0)).toBe(20);
      expect(compositeRed(4)).toBe(255);
      expect(compositeRed(8)).toBeGreaterThan(20);
      expect(compositeRed(8)).toBeLessThan(255);
    }
  });
  it('moves clouds, smoke and tree patches while keeping architecture and layer placement fixed', () => {
    const s = setup(); const layers = createAtmosphereLayers(s.document, art);
    const context = s.target as unknown as CanvasRenderingContext2D;
    layers.draw(context, 0);
    const first = [...s.target.drawImage.mock.calls];
    const smoke = first.filter(([image]) => image === art.smoke);
    expect(smoke).toHaveLength(SMOKE_COUNT);
    const birth = smoke[0]!;
    const scale = birth[7] / SMOKE.width;
    expect(birth[5] + (CHIMNEY.x - SMOKE.x) * scale).toBe(CHIMNEY.x);
    expect(birth[6] + (CHIMNEY.y - SMOKE.y) * scale).toBe(CHIMNEY.y);
    s.target.drawImage.mockClear(); layers.draw(context, 5);
    const second = s.target.drawImage.mock.calls;
    expect(s.canvases[0]!.context.putImageData).toHaveBeenCalledTimes(1);
    for (const index of [1, 2]) {
      const updates = s.canvases[index]!.context.putImageData.mock.calls;
      expect(updates.length).toBeGreaterThan(2);
      expect(updates.slice(1).every(([, x, y]) => x > 0 && y > 0)).toBe(true);
    }
    for (const image of [art.landscape, s.canvases[0], s.canvases[1], s.canvases[2]]) {
      expect(second.find(([drawn]) => drawn === image)).toEqual(first.find(([drawn]) => drawn === image));
    }
    expect(second.find(([drawn]) => drawn === art.clouds)).not.toEqual(first.find(([drawn]) => drawn === art.clouds));
    expect(second.find(([drawn]) => drawn === art.smoke)).not.toEqual(birth);
    layers.dispose(); layers.dispose();
    expect(s.canvases.every(c => c.width === 0 && c.height === 0)).toBe(true);
    const updates = s.canvases[1]!.context.putImageData.mock.calls.length;
    s.target.drawImage.mockClear(); layers.draw(context, 6); expect(s.target.drawImage).not.toHaveBeenCalled();
    expect(s.canvases[1]!.context.putImageData).toHaveBeenCalledTimes(updates);
  });
  it('releases partial allocations after canvas or pixel read failure', () => {
    for (const failAt of [1, 2, 3, 4]) {
      const s = setup(failAt);
      expect(() => createAtmosphereLayers(s.document, art)).toThrow('Atmosphere canvas unavailable');
      expect(s.canvases.every(c => c.width === 0 && c.height === 0)).toBe(true);
    }
    const s = setup();
    const create = s.document.createElement.bind(s.document);
    s.document.createElement = (() => {
      const canvas = create('canvas');
      canvas.getContext('2d')!.getImageData = () => { throw new Error('Pixel access denied'); };
      return canvas;
    }) as typeof s.document.createElement;
    expect(() => createAtmosphereLayers(s.document, art)).toThrow('Pixel access denied');
    expect(s.canvases.every(c => c.width === 0 && c.height === 0)).toBe(true);
  });
  it('restores canvas state if an actor fails', () => {
    const s = setup(); const layers = createAtmosphereLayers(s.document, art);
    expect(() => layers.draw(s.target as unknown as CanvasRenderingContext2D, 2, {
      sky: () => { throw new Error('Actor failed'); },
    })).toThrow('Actor failed');
    expect(s.target.save.mock.calls.length).toBe(s.target.restore.mock.calls.length);
  });
});
