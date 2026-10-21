import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeRenderSize, renderSize } from './renderResolution.js';

afterEach(() => vi.unstubAllGlobals());

describe('display render resolution', () => {
  it.each([
    [1280, 720, 1, 1280, 720],
    [1920, 1080, 1, 1920, 1080],
    [1280, 720, 2, 2560, 1440],
    [1920, 1080, 2, 3840, 2160],
    [2560, 1440, 3, 3840, 2160],
    [2560, 1080, 1, 1920, 1080],
    [900, 1600, 2, 1808, 1017],
    [480, 270, 1, 960, 540],
    [0, NaN, Infinity, 960, 540],
  ])('fits %s × %s at density %s into a bounded 16:9 buffer',
    (width, height, density, expectedWidth, expectedHeight) => {
      expect(renderSize(width, height, density)).toEqual({ width: expectedWidth, height: expectedHeight });
    });

  it('resizes with the container and display density, avoids duplicate work, and releases listeners', () => {
    let bounds = { width: 1280, height: 720 };
    let resizeContainer = () => {};
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resizeContainer = callback; }
      observe = observe;
      disconnect = disconnect;
    });
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const display = { devicePixelRatio: 1, addEventListener, removeEventListener };
    vi.stubGlobal('window', display);
    const mount = { getBoundingClientRect: () => bounds } as HTMLElement;
    const apply = vi.fn();
    const stop = observeRenderSize(mount, apply);
    expect(observe).toHaveBeenCalledWith(mount);
    expect(apply).toHaveBeenLastCalledWith({ width: 1280, height: 720 });
    resizeContainer();
    expect(apply).toHaveBeenCalledTimes(1);
    bounds = { width: 1920, height: 1080 };
    resizeContainer();
    expect(apply).toHaveBeenLastCalledWith({ width: 1920, height: 1080 });
    display.devicePixelRatio = 2;
    const onWindowResize = addEventListener.mock.calls[0]![1] as () => void;
    onWindowResize();
    expect(apply).toHaveBeenLastCalledWith({ width: 3840, height: 2160 });
    stop();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(removeEventListener).toHaveBeenCalledWith('resize', onWindowResize);
  });
});
