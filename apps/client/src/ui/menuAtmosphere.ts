import { ART_WIDTH, ART_HEIGHT } from './menuAtmosphereModel.js';
import { createAtmosphereLayers, type AtmosphereLayers } from './menuAtmosphereLayers.js';

async function loadArt(): Promise<readonly [HTMLImageElement, HTMLImageElement]> {
  const load = async (name: string) => {
    const image = new Image();
    image.src = `${import.meta.env.BASE_URL}assets/original/${name}.webp`;
    await image.decode();
    if (image.naturalWidth !== ART_WIDTH || image.naturalHeight !== ART_HEIGHT) throw new Error('Unexpected artwork dimensions');
    return image;
  };
  return Promise.all([load('menu-clinic-night'), load('menu-clinic-clean-plate')]);
}

export function initializeMenuAtmosphere(document: Document,
  load: () => Promise<readonly [CanvasImageSource, CanvasImageSource]> = loadArt): () => void {
  const canvas = document.querySelector<HTMLCanvasElement>('#menu-atmosphere');
  const button = document.querySelector<HTMLButtonElement>('#menu-motion');
  const window = document.defaultView;
  if (!canvas || !button || !window) return () => {};
  const context = canvas.getContext('2d');
  if (!context) return () => {};
  canvas.width = ART_WIDTH; canvas.height = ART_HEIGHT;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let layers: AtmosphereLayers | undefined;
  let disposed = false;
  let paused = false;
  let frame = 0;
  let elapsed = 0;
  let last: number | undefined;
  let painted = 0;
  const active = () => !disposed && !document.hidden && !reduced.matches && !paused &&
    document.body.dataset.screen !== 'running' && document.body.dataset.screen !== 'fixture';
  const tick = (now: number) => {
    frame = 0;
    if (!active() || !layers) return;
    if (last !== undefined) elapsed += Math.min((now - last) / 1000, .1);
    last = now;
    if (now - painted >= 1000 / 30) { layers.draw(context, elapsed); painted = now; }
    frame = window.requestAnimationFrame(tick);
  };
  const sync = () => {
    window.cancelAnimationFrame(frame);
    frame = 0; last = undefined; painted = 0;
    button.hidden = !layers || reduced.matches;
    button.setAttribute('aria-pressed', String(!paused));
    button.textContent = paused ? 'Resume ambience' : 'Pause ambience';
    canvas.hidden = !layers || reduced.matches;
    if (active() && layers) frame = window.requestAnimationFrame(tick);
  };
  const toggle = () => { paused = !paused; sync(); };
  const observer = new MutationObserver(sync);
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });
  button.addEventListener('click', toggle);
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  sync();
  void load().then(([original, plate]) => {
    if (disposed) return;
    layers = createAtmosphereLayers(document, original, plate);
    layers.draw(context, 0);
    sync();
  }).catch(() => { if (!disposed) { layers?.dispose(); layers = undefined; sync(); } });
  return () => {
    if (disposed) return;
    disposed = true;
    window.cancelAnimationFrame(frame);
    observer.disconnect();
    button.removeEventListener('click', toggle);
    document.removeEventListener('visibilitychange', sync);
    reduced.removeEventListener('change', sync);
    layers?.dispose();
    canvas.hidden = button.hidden = true;
    canvas.width = canvas.height = 0;
  };
}
