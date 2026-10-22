import { PLAYER_CHARACTERS } from '@pokecenter/shared';
import { describe, expect, it, vi } from 'vitest';
import type { SpriteAnimation } from '../sprites/pmd.js';
import { CharacterPortraits, portraitBounds, portraitTiming } from './characterPortraits.js';

class PortraitAnimation extends EventTarget {
  currentTime = 0;
  playState = 'running';
  play = vi.fn(() => { this.playState = 'running'; });
  pause = vi.fn(() => { this.playState = 'paused'; });
  cancel = vi.fn();
}

class Element extends EventTarget {
  hidden = false;
  src = '';
  alt = '';
  className = '';
  naturalWidth = 0;
  naturalHeight = 0;
  dataset = {};
  children: Element[] = [];
  properties = new Map<string, string>();
  style = { setProperty: (key: string, value: string) => this.properties.set(key, value) };
  classes = new Set<string>();
  classList = { add: (name: string) => this.classes.add(name), remove: (name: string) => this.classes.delete(name) };
  animation = new PortraitAnimation();
  animate = vi.fn(() => { this.animation = new PortraitAnimation(); return this.animation; });
  setAttribute = vi.fn();
  constructor(readonly tag = 'span') { super(); }
  append(...children: Element[]) { this.children.push(...children); }
  contains(child: Element): boolean { return this === child || this.children.some((entry) => entry.contains(child)); }
  querySelector(selector: string) {
    return this.children.find((child) => selector === 'img' ? child.tag === 'img' : child.className === selector.slice(1));
  }
}

function setup(withSelection = false) {
  const species = PLAYER_CHARACTERS.map((name, index) => ({ name,
    id: ['0113', '0531', '0067', '0052'][index]!, credits: 'Fixture artist',
    idle: { frameWidth: 24 + index * 8, frameHeight: 32 + index * 8,
      directions: index === 3 ? 1 : 8, durations: [40, 4, 4],
      image: `${['0113', '0531', '0067', '0052'][index]}/Idle-Anim.png` },
    ...(withSelection ? { selection: { frameWidth: 32, frameHeight: 40, directions: 1, durations: [2, 3, 4],
      image: `${['0113', '0531', '0067', '0052'][index]}/Rotate-Anim.png` } } : {}),
  }));
  const mounts = species.map(() => {
    const mount = new Element();
    const fallback = new Element(); fallback.className = 'portrait-fallback';
    const image = new Element('img'); image.hidden = true;
    mount.append(fallback, image);
    return { mount, image, fallback };
  });
  const sources: Element[] = [];
  const media = Object.assign(new EventTarget(), { matches: false });
  const context = { drawImage: vi.fn(), getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(0) })) };
  const canvas = { width: 0, height: 0, getContext: vi.fn((): typeof context | null => null) };
  const document = Object.assign(new EventTarget(), { hidden: false,
    defaultView: { matchMedia: vi.fn(() => media) },
    querySelector: (selector: string) => mounts[PLAYER_CHARACTERS.findIndex((name) => selector === `#portrait-${name}`)]?.mount,
    createElement: (tag: string) => {
      if (tag === 'canvas') return canvas;
      const element = new Element(tag);
      if (tag === 'img') sources.push(element);
      return element;
    },
  });
  const manifest = { source: 'https://example.test/sprites', species };
  const request = vi.fn(async () => ({ ok: true, json: async () => manifest }) as Response);
  const service = new CharacterPortraits(document as unknown as Document, request);
  const loadImage = (index: number, mode: 'idle' | 'selection' = 'idle') => {
    const sprite = species[index]![mode] as SpriteAnimation;
    const image = sources.find((entry) => entry.src === `/assets/external/pmd/${sprite.image}`)!;
    image.naturalWidth = sprite.frameWidth * sprite.durations.length;
    image.naturalHeight = sprite.frameHeight * sprite.directions;
    image.dispatchEvent(new Event('load'));
  };
  return { service, mounts, manifest, request, sources, document, media, loadImage, canvas, context };
}

describe('animated character portraits', () => {
  it('plays one full rotation, returns to Idle, and celebrates again only after a new selection', async () => {
    const { service, mounts, loadImage } = setup(true);
    service.setSelected('Chansey'); service.setActive(true);
    await service.load(); loadImage(0); loadImage(0, 'selection');
    const image = mounts[0]!.image;
    const rotation = image.animation;
    expect(image.src).toContain('Rotate-Anim.png');
    expect(image.animate).toHaveBeenLastCalledWith(expect.any(Array), { duration: 150, iterations: 1 });
    rotation.playState = 'finished';
    const plays = rotation.play.mock.calls.length;
    service.setActive(true);
    expect(rotation.play).toHaveBeenCalledTimes(plays);
    rotation.dispatchEvent(new Event('finish'));
    expect(image.src).toContain('Idle-Anim.png');
    expect(image.animate).toHaveBeenLastCalledWith(expect.any(Array), { duration: 800, iterations: Infinity });
    const calls = image.animate.mock.calls.length;
    service.setSelected('Chansey'); service.setActive(true);
    expect(image.animate).toHaveBeenCalledTimes(calls);
    service.setSelected(undefined); service.setSelected('Chansey');
    expect(image.src).toContain('Rotate-Anim.png');
    expect(image.animate).toHaveBeenCalledTimes(calls + 1);
  });

  it('finishes roster rotations once and ignores completion events for removed or replaced animations', async () => {
    const { service, mounts, loadImage } = setup(true);
    await service.load(); loadImage(0); loadImage(0, 'selection'); loadImage(1); loadImage(1, 'selection');
    const avatar = service.create('Chansey') as unknown as Element;
    const image = avatar.querySelector('img')!;
    image.animation.dispatchEvent(new Event('finish'));
    expect(image.src).toContain('Idle-Anim.png');
    service.setSelected('Chansey');
    const old = mounts[0]!.image.animation;
    service.setSelected('Audino');
    old.dispatchEvent(new Event('finish'));
    expect(mounts[1]!.image.src).toContain('Rotate-Anim.png');
    const removed = service.create('Audino') as unknown as Element;
    const removedImage = removed.querySelector('img')!;
    const calls = removedImage.animate.mock.calls.length;
    service.release(removed as unknown as HTMLElement);
    removedImage.animation.dispatchEvent(new Event('finish'));
    expect(removedImage.animate).toHaveBeenCalledTimes(calls);
  });

  it('celebrates only the chosen card and room portraits, while retaining Idle for all other cards', async () => {
    const { service, mounts, loadImage } = setup(true);
    service.setSelected('Chansey');
    const roster = service.create('Chansey') as unknown as Element;
    await service.load();
    for (let index = 0; index < 4; index += 1) { loadImage(index); loadImage(index, 'selection'); }
    expect(mounts[0]!.image.src).toContain('Rotate-Anim.png');
    expect(roster.querySelector('img')!.src).toBe(mounts[0]!.image.src);
    expect(mounts.slice(1).every(({ image }) => image.src.endsWith('Idle-Anim.png'))).toBe(true);
    expect(mounts[0]!.image.animate).toHaveBeenLastCalledWith(expect.any(Array),
      { duration: 150, iterations: 1 });
    const calls = mounts[0]!.image.animate.mock.calls.length;
    service.setSelected('Chansey');
    expect(mounts[0]!.image.animate).toHaveBeenCalledTimes(calls);
    service.setSelected('Machoke');
    expect(mounts[0]!.image.src).toContain('Idle-Anim.png');
    expect(mounts[2]!.image.src).toContain('Rotate-Anim.png');
    expect(roster.querySelector('img')!.src).toContain('Rotate-Anim.png');
    service.setSelected(undefined);
    expect(mounts.every(({ image }) => image.src.endsWith('Idle-Anim.png'))).toBe(true);
  });

  it('handles late selection sheets without reviving an old choice or replacing a loaded celebration with Idle', async () => {
    const { service, mounts, loadImage } = setup(true);
    await service.load();
    service.setSelected('Chansey');
    loadImage(0, 'selection');
    expect(mounts[0]!.image.src).toContain('Rotate-Anim.png');
    loadImage(0);
    expect(mounts[0]!.image.src).toContain('Rotate-Anim.png');
    service.setSelected('Audino');
    loadImage(1);
    service.setSelected('Machoke');
    loadImage(1, 'selection');
    expect(mounts[0]!.image.src).toContain('Idle-Anim.png');
    expect(mounts[1]!.image.src).toContain('Idle-Anim.png');
    loadImage(2, 'selection');
    service.setSelected('Meowth');
    expect(mounts[2]!.image.hidden).toBe(true);
    loadImage(2);
    expect(mounts[2]!.image.src).toContain('Idle-Anim.png');
  });

  it('keeps Idle when celebration images fail validation and restores celebrations after reduced motion', async () => {
    const { service, mounts, sources, loadImage, media } = setup(true);
    service.setSelected('Chansey');
    service.setActive(true);
    await service.load();
    loadImage(0);
    const invalid = sources.find((image) => image.src.endsWith('0113/Rotate-Anim.png'))!;
    invalid.naturalWidth = 1; invalid.dispatchEvent(new Event('load'));
    expect(mounts[0]!.image.src).toContain('Idle-Anim.png');
    service.setSelected('Audino');
    loadImage(1); loadImage(1, 'selection');
    expect(mounts[1]!.image.src).toContain('Rotate-Anim.png');
    media.matches = true; media.dispatchEvent(new Event('change'));
    expect(mounts[1]!.image.src).toContain('Idle-Anim.png');
    expect(mounts[1]!.image.animation.playState).toBe('paused');
    expect(mounts[1]!.image.animation.currentTime).toBe(0);
    media.matches = false; media.dispatchEvent(new Event('change'));
    expect(mounts[1]!.image.src).toContain('Rotate-Anim.png');
    expect(mounts[1]!.image.animation.playState).toBe('running');
  });

  it('uses a stable union crop across every front-facing frame, including nonempty later frames', () => {
    const pixels = new Uint8ClampedArray(24 * 10 * 4);
    for (const [x, y] of [[2, 3], [13, 6], [23, 4]]) pixels[(y! * 24 + x!) * 4 + 3] = 255;
    expect(portraitBounds(pixels, 24, 10, 8)).toEqual({ x: 2, y: 3, width: 6, height: 4 });
    expect(portraitBounds(new Uint8ClampedArray(24 * 10 * 4), 24, 10, 8)).toBeNull();
    expect(portraitBounds(pixels, 24, 10)).toEqual({ x: 2, y: 3, width: 22, height: 4 });
  });

  it('holds discrete frames for their original unequal durations and loops to the first frame', () => {
    const { manifest } = setup();
    const timing = portraitTiming(manifest.species[0]!.idle, 2);
    expect(timing.duration).toBe(800);
    expect(timing.keyframes).toEqual([
      { offset: 0, transform: 'translateX(0px)', easing: 'steps(1, end)' },
      { offset: 40 / 48, transform: 'translateX(-48px)', easing: 'steps(1, end)' },
      { offset: 44 / 48, transform: 'translateX(-96px)', easing: 'steps(1, end)' },
      { offset: 1, transform: 'translateX(0px)' },
    ]);
  });

  it('shares validated local sheets between the picker and dynamically created roster portraits', async () => {
    const { service, mounts, request, sources, loadImage } = setup();
    const pending = service.load();
    expect(service.load()).toBe(pending);
    await pending;
    expect(request).toHaveBeenCalledExactlyOnceWith('/assets/external/pmd/manifest.json');
    expect(request.mock.contexts).toEqual([undefined]);
    expect(sources.map((image) => image.src)).toEqual([
      '/assets/external/pmd/0113/Idle-Anim.png', '/assets/external/pmd/0531/Idle-Anim.png',
      '/assets/external/pmd/0067/Idle-Anim.png', '/assets/external/pmd/0052/Idle-Anim.png',
    ]);
    for (let index = 0; index < 4; index += 1) loadImage(index);
    const roster = service.create('Chansey') as unknown as Element;
    const image = roster.querySelector('img')!;
    expect(image.src).toBe(mounts[0]!.image.src);
    expect(image.hidden).toBe(false);
    expect(roster.properties.get('--portrait-scale')).toBe(String(34 / 32));
    expect(mounts[0]!.mount.properties.get('--portrait-scale')).toBe('3.5');
    expect(mounts[3]!.mount.properties.get('--portrait-directions')).toBe('1');
    expect(mounts.every(({ image, fallback }) => !image.hidden && fallback.hidden)).toBe(true);
    expect(image.animate).toHaveBeenCalledWith(portraitTiming({ frameWidth: 24, frameHeight: 32,
      durations: [40, 4, 4], directions: 8, image: '' }, 34 / 32).keyframes,
    { duration: 800, iterations: Infinity });
    expect(image.animation.playState).toBe('paused');
    service.setActive(true);
    expect(image.animation.playState).toBe('running');
  });

  it('fits every visible frame without clipping or changing the crop between frames', async () => {
    const { service, mounts, loadImage, canvas, context } = setup();
    const pixels = new Uint8ClampedArray(72 * 32 * 4);
    pixels[(5 * 72 + 3) * 4 + 3] = 255;
    pixels[(28 * 72 + 44) * 4 + 3] = 255;
    pixels[(30 * 72 + 71) * 4 + 3] = 255;
    context.getImageData.mockReturnValue({ data: pixels });
    canvas.getContext.mockReturnValue(context);
    await service.load(); loadImage(0);
    expect(canvas.width).toBe(72);
    expect(canvas.height).toBe(32);
    expect(mounts[0]!.mount.properties.get('--portrait-content-x')).toBe('3');
    expect(mounts[0]!.mount.properties.get('--portrait-content-width')).toBe('21');
    expect(mounts[0]!.mount.properties.get('--portrait-content-height')).toBe('26');
    expect(Number(mounts[0]!.mount.properties.get('--portrait-scale')) * 26).toBeCloseTo(112);
  });

  it('pauses hidden screens and tabs, resumes without restarting, and freezes reduced motion at frame zero', async () => {
    const { service, mounts, document, media, loadImage } = setup();
    await service.load(); service.setActive(true); loadImage(0);
    const animation = mounts[0]!.image.animation;
    animation.currentTime = 700;
    service.setActive(true);
    expect(animation.play).toHaveBeenCalledOnce();
    document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
    expect(animation.playState).toBe('paused');
    expect(animation.currentTime).toBe(700);
    document.hidden = false; document.dispatchEvent(new Event('visibilitychange'));
    expect(animation.playState).toBe('running');
    expect(animation.currentTime).toBe(700);
    media.matches = true; media.dispatchEvent(new Event('change'));
    expect(animation.currentTime).toBe(0);
    expect(animation.playState).toBe('paused');
    media.matches = false; media.dispatchEvent(new Event('change'));
    expect(animation.playState).toBe('running');
    service.setActive(false);
    expect(animation.playState).toBe('paused');
  });

  it('releases removed portraits, ignores late loads, and cancels animations and listeners on disposal', async () => {
    const { service, mounts, loadImage, document, media } = setup();
    await service.load();
    const removed = service.create('Chansey') as unknown as Element;
    service.release(removed as unknown as HTMLElement);
    loadImage(0);
    expect(removed.querySelector('img')!.hidden).toBe(true);
    const parent = new Element();
    const avatar = service.create('Chansey') as unknown as Element;
    parent.append(avatar);
    service.release(parent as unknown as HTMLElement);
    expect(avatar.querySelector('img')!.animation.cancel).toHaveBeenCalledOnce();
    service.setActive(true);
    expect(avatar.querySelector('img')!.animation.play).not.toHaveBeenCalled();
    service.dispose();
    const animation = mounts[0]!.image.animation;
    expect(animation.cancel).toHaveBeenCalledOnce();
    const plays = animation.play.mock.calls.length;
    document.dispatchEvent(new Event('visibilitychange')); media.dispatchEvent(new Event('change'));
    expect(animation.play).toHaveBeenCalledTimes(plays);
    loadImage(1);
    expect(mounts[1]!.image.hidden).toBe(true);
    expect((service.create('Chansey') as unknown as Element).querySelector('img')!.hidden).toBe(true);
  });

  it('keeps fallbacks for missing images, mismatched dimensions and fully transparent sheets', async () => {
    const { service, mounts, sources, canvas, context } = setup();
    canvas.getContext.mockReturnValue(context);
    await service.load();
    sources[0]!.dispatchEvent(new Event('error'));
    sources[1]!.naturalWidth = 1; sources[1]!.dispatchEvent(new Event('load'));
    sources[2]!.naturalWidth = 40 * 3; sources[2]!.naturalHeight = 1;
    sources[2]!.dispatchEvent(new Event('load'));
    sources[3]!.naturalWidth = 48 * 3; sources[3]!.naturalHeight = 56;
    sources[3]!.dispatchEvent(new Event('load'));
    expect(mounts.every(({ image, fallback }) => image.hidden && !fallback.hidden)).toBe(true);
  });

  it('retains full-frame previews when pixel access or animation APIs are unavailable', async () => {
    const { service, mounts, canvas, loadImage } = setup();
    canvas.getContext.mockImplementation(() => { throw new Error('Pixel access denied'); });
    Object.assign(mounts[0]!.image, { animate: undefined });
    await service.load(); loadImage(0);
    expect(mounts[0]!.image.hidden).toBe(false);
    expect(mounts[0]!.mount.properties.get('--portrait-content-width')).toBe('24');
    expect(mounts[0]!.mount.properties.get('--portrait-content-height')).toBe('32');
  });

  it('loads available species if a manifest omits a character and handles disposal during a fetch', async () => {
    const { service, manifest, sources, mounts } = setup();
    manifest.species.pop();
    await service.load();
    expect(sources).toHaveLength(3);
    expect(mounts[3]!.image.src).toBe('');
    const disposed = setup();
    const loading = disposed.service.load(); disposed.service.dispose(); await loading;
    expect(disposed.sources).toHaveLength(0);
  });

  it('leaves names and selection usable for unavailable, malformed and uncredited manifests', async () => {
    for (const failure of ['http', 'network', 'json', 'credits', 'path'] as const) {
      const { manifest, sources, request, service } = setup();
      if (failure === 'http') request.mockResolvedValue({ ok: false } as Response);
      if (failure === 'network') request.mockRejectedValue(new Error('Offline'));
      if (failure === 'json') request.mockResolvedValue({ ok: true,
        json: async () => { throw new Error('Invalid JSON'); } } as unknown as Response);
      if (failure === 'credits') manifest.species[0]!.credits = '';
      if (failure === 'path') manifest.species[0]!.idle.image = 'https://example.test/other.png';
      await expect(service.load()).resolves.toBeUndefined();
      expect(sources).toHaveLength(0);
    }
  });
});
