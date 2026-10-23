import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeMenuAtmosphere, loadAtmosphereArt } from './menuAtmosphere.js';
import { createAtmosphereLayers, type AtmosphereArt, type AtmosphereActors } from './menuAtmosphereLayers.js';
import type { MenuCritters } from './menuCritters.js';

vi.mock('./menuAtmosphereLayers.js', () => ({ createAtmosphereLayers: vi.fn() }));
class Control extends EventTarget {
  hidden = true;
  width = 0;
  height = 0;
  textContent = '';
  attributes = new Map<string, string>();
  context = {};
  getContext() { return this.context; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
}
afterEach(() => vi.unstubAllGlobals());
const art = Object.fromEntries(['landscape', 'clouds', 'rearTrees', 'clinic', 'trees', 'smoke'].map(key => [key, {}])) as unknown as AtmosphereArt;
let mutation: () => void;
const disconnect = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('MutationObserver', class {
    constructor(callback: () => void) { mutation = callback; }
    observe() {}
    disconnect = disconnect;
  });
});
function setup(reducedMotion = false, critters?: () => Promise<MenuCritters | null>) {
  const canvas = new Control(), button = new Control();
  const reduced = Object.assign(new EventTarget(), { matches: reducedMotion });
  const frames = new Map<number, FrameRequestCallback>();
  let next = 0;
  const document = Object.assign(new EventTarget(), {
    hidden: false, body: { dataset: { screen: 'menu' } },
    querySelector: (selector: string) => selector === '#menu-atmosphere' ? canvas : button,
    defaultView: { matchMedia: () => reduced,
      requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++next, callback); return next; },
      cancelAnimationFrame: (id: number) => frames.delete(id) },
  });
  let resolve!: (art: AtmosphereArt) => void;
  let reject!: (error: Error) => void;
  const loaded = new Promise<AtmosphereArt>((yes, no) => { resolve = yes; reject = no; });
  const layers = { draw: vi.fn((context: CanvasRenderingContext2D, _seconds: number, actors?: AtmosphereActors) => { actors?.sky?.(context); actors?.ground?.(context); }), dispose: vi.fn() };
  vi.mocked(createAtmosphereLayers).mockReturnValue(layers);
  const dispose = initializeMenuAtmosphere(document as unknown as Document, () => loaded, critters);
  const tick = (time: number) => {
    const item = [...frames][0];
    if (item) { frames.delete(item[0]); item[1](time); }
  };
  const finish = async () => { resolve(art); await Promise.resolve(); await Promise.resolve(); };
  return { canvas, button, reduced, frames, document, layers, dispose, tick, finish, reject };
}

describe('menu atmosphere lifecycle', () => {
  it('supplies both Pokémon depth planes at the same animation time once loaded', async () => {
    const critters = { draw: vi.fn(), drawSky: vi.fn() };
    let ready!: (value: MenuCritters | null) => void;
    const s = setup(false, () => new Promise((resolve) => { ready = resolve; }));
    ready(critters);
    await Promise.resolve(); await Promise.resolve();
    expect(critters.draw).not.toHaveBeenCalled();
    await s.finish();
    expect(critters.draw).toHaveBeenCalledWith(s.canvas.context, 0);
    expect(critters.drawSky).toHaveBeenCalledWith(s.canvas.context, 0);
    expect(s.layers.draw.mock.lastCall![2]).toHaveProperty('ground');
    s.tick(100); s.tick(160);
    const [, time] = s.layers.draw.mock.lastCall!;
    expect(critters.draw).toHaveBeenLastCalledWith(s.canvas.context, time);
    expect(s.layers.draw.mock.invocationCallOrder.at(-1)).toBeLessThan(critters.draw.mock.invocationCallOrder.at(-1)!);
    s.dispose();
  });

  it('paints critters that arrive after the art, and ignores a missing sprite cache or a late load after disposal', async () => {
    const late = { draw: vi.fn(), drawSky: vi.fn() };
    let ready!: (value: MenuCritters | null) => void;
    const s = setup(false, () => new Promise((resolve) => { ready = resolve; }));
    await s.finish();
    ready(late);
    await Promise.resolve(); await Promise.resolve();
    expect(late.draw).toHaveBeenCalledOnce();
    s.dispose();
    const absent = setup(false, () => Promise.resolve(null));
    await absent.finish();
    absent.tick(100);
    expect(absent.layers.draw).toHaveBeenCalled();
    expect(absent.layers.draw.mock.lastCall![2]).toBeUndefined();
    absent.dispose();
    const disposed = { draw: vi.fn(), drawSky: vi.fn() };
    let resolveLate!: (value: MenuCritters | null) => void;
    const gone = setup(false, () => new Promise((resolve) => { resolveLate = resolve; }));
    await gone.finish();
    gone.dispose();
    resolveLate(disposed);
    await Promise.resolve(); await Promise.resolve();
    expect(disposed.draw).not.toHaveBeenCalled();
    const failing = setup(false, () => Promise.reject(new Error('offline')));
    await failing.finish();
    expect(failing.layers.draw).toHaveBeenCalled();
    failing.dispose();
  });

  it('keeps the layered still visible until ready, then pauses/resumes without a time jump', async () => {
    const s = setup();
    expect(s.canvas.hidden).toBe(true); expect(s.button.hidden).toBe(true);
    await s.finish();
    expect(s.canvas.hidden).toBe(false); expect(s.frames.size).toBe(1);
    s.tick(100); s.tick(140);
    const time = s.layers.draw.mock.lastCall![1];
    expect(time).toBeGreaterThan(0);
    s.button.dispatchEvent(new Event('click'));
    expect(s.frames.size).toBe(0);
    expect(s.button.textContent).toBe('Resume ambience');
    expect(s.button.attributes.get('aria-pressed')).toBe('false');
    s.button.dispatchEvent(new Event('click')); s.tick(9000);
    expect(s.layers.draw.mock.lastCall![1]).toBe(time);
    s.dispose();
  });
  it('sleeps in hidden tabs, gameplay and fixtures and restarts on the menu', async () => {
    const s = setup(); await s.finish();
    s.document.hidden = true; s.document.dispatchEvent(new Event('visibilitychange'));
    expect(s.frames.size).toBe(0);
    s.document.hidden = false; s.document.dispatchEvent(new Event('visibilitychange'));
    expect(s.frames.size).toBe(1);
    for (const screen of ['running', 'fixture']) {
      s.document.body.dataset.screen = screen; mutation(); expect(s.frames.size).toBe(0);
    }
    s.document.body.dataset.screen = 'menu'; mutation(); expect(s.frames.size).toBe(1);
    s.dispose();
  });
  it('uses the exact layered still for reduced motion and reacts to preference changes', async () => {
    const s = setup(true); await s.finish();
    expect(s.canvas.hidden).toBe(true); expect(s.button.hidden).toBe(true); expect(s.frames.size).toBe(0);
    s.reduced.matches = false; s.reduced.dispatchEvent(new Event('change'));
    expect(s.canvas.hidden).toBe(false); expect(s.frames.size).toBe(1);
    s.reduced.matches = true; s.reduced.dispatchEvent(new Event('change'));
    expect(s.frames.size).toBe(0); expect(s.canvas.hidden).toBe(true);
    s.dispose();
  });
  it('retains the layered still on image or layer preparation failure', async () => {
    const s = setup(); s.reject(new Error('Missing art')); await Promise.resolve(); await Promise.resolve();
    expect(s.canvas.hidden).toBe(true); expect(s.frames.size).toBe(0); s.dispose();
    const second = setup(); vi.mocked(createAtmosphereLayers).mockImplementationOnce(() => { throw new Error('Canvas failed'); });
    await second.finish(); expect(second.canvas.hidden).toBe(true); expect(second.frames.size).toBe(0); second.dispose();
  });
  it('limits drawing to 30 fps and caps suspension time', async () => {
    const s = setup(); await s.finish(); s.tick(100);
    const calls = s.layers.draw.mock.calls.length;
    s.tick(110); s.tick(120); expect(s.layers.draw).toHaveBeenCalledTimes(calls);
    s.tick(140); expect(s.layers.draw).toHaveBeenCalledTimes(calls + 1);
    s.tick(100000); expect(s.layers.draw.mock.lastCall![1]).toBeLessThanOrEqual(.15);
    s.dispose();
  });
  it('cleans up once and ignores a late image load', async () => {
    const s = setup(); s.dispose(); s.dispose(); await s.finish();
    expect(createAtmosphereLayers).not.toHaveBeenCalled(); expect(s.frames.size).toBe(0);
    expect(disconnect).toHaveBeenCalledOnce();
    const loaded = setup(); await loaded.finish(); loaded.dispose(); loaded.dispose();
    loaded.button.dispatchEvent(new Event('click'));
    expect(loaded.layers.dispose).toHaveBeenCalledOnce(); expect(loaded.frames.size).toBe(0);
    expect(loaded.canvas.width).toBe(0);
  });
  it('tolerates missing elements and unavailable canvas', () => {
    expect(initializeMenuAtmosphere({ querySelector: () => null } as unknown as Document)).toBeTypeOf('function');
    expect(initializeMenuAtmosphere({ querySelector: () => ({ getContext: () => null }), defaultView: {} } as unknown as Document)).toBeTypeOf('function');
  });
});


describe('layered artwork loading', () => {
  function images(fail = false, wrongSize = false, missing = '04-foreground') {
    const loaded: string[] = [];
    vi.stubGlobal('Image', class {
      src = '';
      naturalWidth = wrongSize ? 100 : 1672;
      naturalHeight = 941;
      async decode() { loaded.push(this.src); if (fail && this.src.includes(missing)) throw new Error('Missing trees'); }
    });
    return loaded;
  }
  it('decodes all six registered layers before returning the scene', async () => {
    const loaded = images();
    const result = await loadAtmosphereArt();
    expect(Object.keys(result)).toEqual(['landscape', 'clouds', 'rearTrees', 'clinic', 'trees', 'smoke']);
    expect(loaded).toHaveLength(6);
    expect(loaded.some(url => url.endsWith('/02b-rear-trees.webp'))).toBe(true);
    expect(loaded.some(url => url.endsWith('/02-clouds-painted.webp'))).toBe(true);
    expect(loaded.every(url => url.includes('/menu-clinic-layered-v2/') && url.endsWith('.webp'))).toBe(true);
    expect(loaded.some(url => url.includes('clean-plate'))).toBe(false);
  });
  it('rejects a missing layer or mismatched dimensions instead of revealing an incomplete scene', async () => {
    images(true);
    await expect(loadAtmosphereArt()).rejects.toThrow('Missing trees');
    images(true, false, '02b-rear-trees');
    await expect(loadAtmosphereArt()).rejects.toThrow('Missing trees');
    images(false, true);
    await expect(loadAtmosphereArt()).rejects.toThrow('Unexpected artwork dimensions');
  });
});
