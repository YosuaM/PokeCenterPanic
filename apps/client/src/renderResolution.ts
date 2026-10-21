export const LOGICAL_WIDTH = 960;
export const LOGICAL_HEIGHT = 540;
export const MAX_RENDER_SCALE = 4;

export interface RenderSize { width: number; height: number }

export function renderSize(width: number, height: number, density = 1): RenderSize {
  const valid = (value: number, fallback: number) =>
    Number.isFinite(value) && value > 0 ? value : fallback;
  const fit = Math.min(valid(width, LOGICAL_WIDTH) / LOGICAL_WIDTH,
    valid(height, LOGICAL_HEIGHT) / LOGICAL_HEIGHT);
  const scale = Math.max(1, Math.min(MAX_RENDER_SCALE, fit * valid(density, 1)));
  // Whole 16:9 units keep both renderers and the DOM overlay on the same projection.
  const units = Math.ceil(LOGICAL_WIDTH * scale / 16);
  return { width: units * 16, height: units * 9 };
}

export function observeRenderSize(mount: HTMLElement, apply: (size: RenderSize) => void): () => void {
  let previous: RenderSize | undefined;
  const update = () => {
    const bounds = mount.getBoundingClientRect();
    const size = renderSize(bounds.width, bounds.height, window.devicePixelRatio);
    if (size.width === previous?.width && size.height === previous.height) return;
    previous = size;
    apply(size);
  };
  const observer = new ResizeObserver(update);
  observer.observe(mount);
  window.addEventListener('resize', update);
  update();
  return () => {
    observer.disconnect();
    window.removeEventListener('resize', update);
  };
}
