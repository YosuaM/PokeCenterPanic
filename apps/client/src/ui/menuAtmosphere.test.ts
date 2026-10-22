import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeMenuAtmosphere } from './menuAtmosphere.js';
import { createAtmosphereLayers } from './menuAtmosphereLayers.js';

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
function setup(reducedMotion = false) {
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
  let resolve!: (art: readonly [CanvasImageSource, CanvasImageSource]) => void;
  let reject!: (error: Error) => void;
  const loaded = new Promise<readonly [CanvasImageSource, CanvasImageSource]>((yes, no) => { resolve = yes; reject = no; });
  const layers = { draw: vi.fn(), dispose: vi.fn() };
  vi.mocked(createAtmosphereLayers).mockReturnValue(layers);
  const dispose = initializeMenuAtmosphere(document as unknown as Document, () => loaded);
  const tick = (time: number) => {
    const item = [...frames][0];
    if (item) { frames.delete(item[0]); item[1](time); }
  };
  const finish = async () => { resolve([{} as CanvasImageSource, {} as CanvasImageSource]); await Promise.resolve(); await Promise.resolve(); };
  return { canvas, button, reduced, frames, document, layers, dispose, tick, finish, reject };
}

describe('menu atmosphere lifecycle', () => {
  it('keeps the original still visible until ready, then pauses/resumes without a time jump', async () => {
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
  it('uses the exact original still for reduced motion and reacts to preference changes', async () => {
    const s = setup(true); await s.finish();
    expect(s.canvas.hidden).toBe(true); expect(s.button.hidden).toBe(true); expect(s.frames.size).toBe(0);
    s.reduced.matches = false; s.reduced.dispatchEvent(new Event('change'));
    expect(s.canvas.hidden).toBe(false); expect(s.frames.size).toBe(1);
    s.reduced.matches = true; s.reduced.dispatchEvent(new Event('change'));
    expect(s.frames.size).toBe(0); expect(s.canvas.hidden).toBe(true);
    s.dispose();
  });
  it('retains the original on image or layer preparation failure', async () => {
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
