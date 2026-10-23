import { describe, expect, it, vi } from 'vitest';
import { MIN_SCREEN_SCALE, ScreenFit, fitScale } from './screenFit.js';

describe('fitScale', () => {
  it('shrinks to the tighter axis, never enlarges and stops at the readable minimum', () => {
    expect(fitScale({ width: 1920, height: 1080 }, { width: 1180, height: 760 })).toBe(1);
    expect(fitScale({ width: 1280, height: 600 }, { width: 1180, height: 800 })).toBe(0.75);
    expect(fitScale({ width: 500, height: 900 }, { width: 1000, height: 600 })).toBe(0.5);
    expect(fitScale({ width: 390, height: 300 }, { width: 390, height: 1650 })).toBe(MIN_SCREEN_SCALE);
    expect(fitScale({ width: 390, height: 300 }, { width: 390, height: 1650 }, 0.1)).toBe(0.181);
  });

  it('keeps full size while either box is still unmeasured', () => {
    expect(fitScale({ width: 0, height: 0 }, { width: 100, height: 100 })).toBe(1);
    expect(fitScale({ width: 100, height: 100 }, { width: 0, height: 0 })).toBe(1);
    expect(fitScale({ width: Number.NaN, height: 100 }, { width: 50, height: 500 })).toBe(1);
  });
});

function element(width: number, height: number, hidden = false) {
  const classes = new Set<string>();
  const properties = new Map<string, string>();
  return { hidden, offsetWidth: width, offsetHeight: height, clientWidth: width, clientHeight: height, children: [] as unknown[],
    classes, properties, style: { setProperty: (name: string, value: string) => properties.set(name, value) },
    classList: { toggle: (name: string, on: boolean) => on ? classes.add(name) : classes.delete(name) } };
}

describe('ScreenFit', () => {
  it('scales the visible screen into the stage and rescales when either is resized', () => {
    const stage = element(1280, 600);
    const menu = element(1280, 500, true);
    const lobby = element(1180, 800);
    stage.children = [menu, lobby];
    const observed: unknown[] = [];
    let resize = () => {};
    const disconnect = vi.fn();
    const view = { ResizeObserver: class {
      constructor(callback: () => void) { resize = callback; }
      observe(target: unknown) { observed.push(target); }
      disconnect = disconnect;
    } } as unknown as Window & typeof globalThis;
    const fit = new ScreenFit(stage as unknown as HTMLElement, view);
    expect(observed).toEqual([stage, menu, lobby]);
    expect(stage.properties.get('--fit-scale')).toBe('0.75');
    expect(stage.classes.has('is-overflowing')).toBe(false);
    lobby.hidden = true;
    menu.hidden = false;
    resize();
    expect(stage.properties.get('--fit-scale')).toBe('1');
    stage.clientHeight = 200;
    resize();
    expect(stage.properties.get('--fit-scale')).toBe(String(MIN_SCREEN_SCALE));
    expect(stage.classes.has('is-overflowing')).toBe(true);
    fit.destroy();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('still fits once without a resize observer', () => {
    const stage = element(400, 300);
    stage.children = [element(400, 600)];
    const fit = new ScreenFit(stage as unknown as HTMLElement, null);
    expect(stage.properties.get('--fit-scale')).toBe('0.5');
    fit.update();
    expect(() => fit.destroy()).not.toThrow();
  });
});
