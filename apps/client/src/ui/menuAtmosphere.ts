import { ART_WIDTH, ART_HEIGHT } from './menuAtmosphereModel.js';
import { createAtmosphereLayers, type AtmosphereArt, type AtmosphereLayers } from './menuAtmosphereLayers.js';
import type { MenuCritters } from './menuCritters.js';

export async function loadAtmosphereArt(): Promise<AtmosphereArt> {
  const load = async (name: string) => {
    const image = new Image();
    image.src = `${import.meta.env.BASE_URL}assets/original/menu-clinic-layered-v2/${name}.webp`;
    await image.decode();
    if (image.naturalWidth !== ART_WIDTH || image.naturalHeight !== ART_HEIGHT) throw new Error('Unexpected artwork dimensions');
    return image;
  };
  const [landscape, clouds, rearTrees, clinic, trees, smoke] = await Promise.all([
    load('01-landscape'), load('02-clouds-painted'), load('02b-rear-trees'), load('03-clinic-ground'), load('04-foreground-trees'), load('05-smoke'),
  ]);
  return { landscape, clouds, rearTrees, clinic, trees, smoke };
}

export function initializeMenuAtmosphere(document: Document,
  load: () => Promise<AtmosphereArt> = loadAtmosphereArt,
  loadCritters: () => Promise<MenuCritters | null> = () => Promise.resolve(null)): () => void {
  const canvas = document.querySelector<HTMLCanvasElement>('#menu-atmosphere');
  const button = document.querySelector<HTMLButtonElement>('#menu-motion');
  const window = document.defaultView;
  if (!canvas || !button || !window) return () => {};
  const context = canvas.getContext('2d');
  if (!context) return () => {};
  canvas.width = ART_WIDTH; canvas.height = ART_HEIGHT;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let layers: AtmosphereLayers | undefined;
  let critters: MenuCritters | null = null;
  const paint = (seconds: number) => {
    layers!.draw(context, seconds, critters ? {
      sky: (target) => { critters!.drawSky(target, seconds); },
      ground: (target) => critters!.draw(target, seconds),
    } : undefined);
  };
  let disposed = false;
  let paused = false;
  let frame = 0;
  let elapsed = 0;
  let last: number | undefined;
  let painted = 0;
  // Slack absorbs timestamp jitter so a 60 Hz display paints every second frame instead of alternating 2 and 3.
  const frameMs = 1000 / 30 - 4;
  const active = () => !disposed && !document.hidden && !reduced.matches && !paused &&
    document.body.dataset.screen !== 'running' && document.body.dataset.screen !== 'fixture';
  const tick = (now: number) => {
    frame = 0;
    if (!active() || !layers) return;
    if (last !== undefined) elapsed += Math.min((now - last) / 1000, .1);
    last = now;
    if (now - painted >= frameMs) { paint(elapsed); painted = now; }
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
  void load().then((art) => {
    if (disposed) return;
    layers = createAtmosphereLayers(document, art);
    paint(0);
    sync();
  }).catch(() => { if (!disposed) { layers?.dispose(); layers = undefined; sync(); } });
  void loadCritters().then((loaded) => {
    if (disposed || !loaded) return;
    critters = loaded;
    if (layers) paint(elapsed);
  }).catch(() => {});
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
