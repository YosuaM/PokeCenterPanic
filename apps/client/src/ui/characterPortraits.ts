import { PLAYER_CHARACTERS, type PlayerCharacter } from '@pokecenter/shared';
import { parseSpriteManifest, type SpriteAnimation } from '../sprites/pmd.js';

interface Bounds { x: number; y: number; width: number; height: number }
interface Portrait { character: PlayerCharacter; size: number; celebrating: boolean;
  picker?: boolean; resource?: Resource; animation?: Animation }
interface Resource { sprite: SpriteAnimation; url: string; bounds: Bounds; mode: AnimationMode }
type AnimationMode = 'idle' | 'selection';

export function portraitBounds(pixels: Uint8ClampedArray, width: number, height: number,
  frameWidth = width): Bounds | null {
  let left = frameWidth; let right = -1; let top = height; let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pixels[(y * width + x) * 4 + 3]) continue;
      const localX = x % frameWidth;
      left = Math.min(left, localX); right = Math.max(right, localX);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

export function portraitTiming(sprite: SpriteAnimation, scale: number):
  { keyframes: Keyframe[]; duration: number } {
  const total = sprite.durations.reduce((sum, duration) => sum + duration, 0);
  let elapsed = 0;
  const keyframes: Keyframe[] = sprite.durations.map((duration, frame) => {
    const keyframe = { offset: elapsed / total,
      transform: `translateX(${-frame * sprite.frameWidth * scale}px)`, easing: 'steps(1, end)' };
    elapsed += duration;
    return keyframe;
  });
  keyframes.push({ offset: 1, transform: 'translateX(0px)' });
  return { keyframes, duration: total * 1000 / 60 };
}

export class CharacterPortraits {
  private readonly portraits = new Map<HTMLElement, Portrait>();
  private readonly resources = new Map<PlayerCharacter, Partial<Record<AnimationMode, Resource>>>();
  private readonly reducedMotion: MediaQueryList | undefined;
  private loading?: Promise<void>;
  private active = false;
  private selected: PlayerCharacter | undefined;
  private disposed = false;
  private readonly refresh = () => {
    for (const [mount, portrait] of this.portraits) this.render(mount, portrait);
    this.syncAnimations();
  };

  constructor(private readonly document: Document, private readonly request: typeof fetch = fetch) {
    this.reducedMotion = document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion?.addEventListener('change', this.refresh);
    document.addEventListener('visibilitychange', this.refresh);
    for (const character of PLAYER_CHARACTERS) {
      const mount = document.querySelector<HTMLElement>(`#portrait-${character}`);
      if (mount) this.portraits.set(mount, { character, size: 112, celebrating: false, picker: true });
    }
  }

  load(): Promise<void> {
    this.loading ??= this.loadResources();
    return this.loading;
  }

  create(character: PlayerCharacter, size = 34): HTMLElement {
    const mount = this.document.createElement('span');
    mount.className = 'character-portrait';
    mount.dataset.character = character;
    mount.setAttribute('aria-hidden', 'true');
    const fallback = this.document.createElement('span');
    fallback.className = 'portrait-fallback';
    fallback.textContent = '?';
    const image = this.document.createElement('img');
    image.alt = '';
    image.hidden = true;
    mount.append(fallback, image);
    if (!this.disposed) {
      const portrait = { character, size, celebrating: true };
      this.portraits.set(mount, portrait);
      this.render(mount, portrait);
    }
    return mount;
  }

  release(root: HTMLElement): void {
    for (const [mount, portrait] of this.portraits) {
      if (mount !== root && !root.contains(mount)) continue;
      portrait.animation?.cancel();
      this.portraits.delete(mount);
    }
  }

  setActive(active: boolean): void {
    this.active = active;
    this.syncAnimations();
  }

  setSelected(character: PlayerCharacter | undefined): void {
    if (this.selected === character) return;
    this.selected = character;
    for (const [mount, portrait] of this.portraits) {
      if (!portrait.picker) continue;
      portrait.celebrating = portrait.character === character;
      this.render(mount, portrait);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.reducedMotion?.removeEventListener('change', this.refresh);
    this.document.removeEventListener('visibilitychange', this.refresh);
    for (const portrait of this.portraits.values()) portrait.animation?.cancel();
    this.portraits.clear();
    this.resources.clear();
  }

  private async loadResources(): Promise<void> {
    try {
      const request = this.request;
      const response = await request('/assets/external/pmd/manifest.json');
      if (!response.ok) return;
      const manifest = parseSpriteManifest(await response.json());
      if (this.disposed) return;
      for (const character of PLAYER_CHARACTERS) {
        const species = manifest.species.find((entry) => entry.name === character);
        for (const mode of ['idle', 'selection'] as const) {
          const sprite = species?.[mode];
          if (sprite) this.loadSprite(character, mode, sprite);
        }
      }
    } catch { /* Names and selection remain usable without the local sprite cache. */ }
  }

  private loadSprite(character: PlayerCharacter, mode: AnimationMode, sprite: SpriteAnimation): void {
    const image = this.document.createElement('img');
    const url = `/assets/external/pmd/${sprite.image}`;
    image.addEventListener('load', () => {
      if (this.disposed || image.naturalWidth !== sprite.frameWidth * sprite.durations.length ||
        image.naturalHeight !== sprite.frameHeight * sprite.directions) return;
      let bounds: Bounds | null = { x: 0, y: 0, width: sprite.frameWidth, height: sprite.frameHeight };
      try {
        const canvas = this.document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = sprite.frameHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (context) {
          context.drawImage(image, 0, 0);
          bounds = portraitBounds(context.getImageData(0, 0, canvas.width, canvas.height).data,
            canvas.width, canvas.height, sprite.frameWidth);
        }
      } catch { /* Retain full frames when pixel reads are unavailable. */ }
      if (!bounds) return;
      const resources = this.resources.get(character) ?? {};
      resources[mode] = { sprite, url, bounds, mode };
      this.resources.set(character, resources);
      for (const [mount, portrait] of this.portraits) {
        if (portrait.character === character) this.render(mount, portrait);
      }
    }, { once: true });
    image.src = url;
  }

  private render(mount: HTMLElement, portrait: Portrait): void {
    const resources = this.resources.get(portrait.character);
    const resource = portrait.celebrating && !this.reducedMotion?.matches && mount.querySelector('img')?.animate ?
      resources?.selection ?? resources?.idle : resources?.idle;
    if (portrait.resource === resource) return;
    if (resource) this.show(mount, portrait, resource);
    else {
      portrait.animation?.cancel();
      delete portrait.animation;
      delete portrait.resource;
      mount.classList.remove('is-loaded');
      const image = mount.querySelector('img');
      if (image) image.hidden = true;
      const fallback = mount.querySelector<HTMLElement>('.portrait-fallback');
      if (fallback) fallback.hidden = false;
    }
  }

  private show(mount: HTMLElement, portrait: Portrait, resource: Resource): void {
    const { sprite, url, bounds } = resource;
    const image = mount.querySelector('img');
    if (!image) return;
    portrait.resource = resource;
    const scale = Math.min(5, portrait.size / bounds.width, portrait.size / bounds.height);
    const properties = { 'frame-width': sprite.frameWidth, 'frame-height': sprite.frameHeight,
      frames: sprite.durations.length, directions: sprite.directions, scale,
      'content-x': bounds.x, 'content-y': bounds.y, 'content-width': bounds.width, 'content-height': bounds.height };
    for (const [key, value] of Object.entries(properties)) mount.style.setProperty(`--portrait-${key}`, String(value));
    image.src = url;
    image.hidden = false;
    mount.classList.add('is-loaded');
    const fallback = mount.querySelector<HTMLElement>('.portrait-fallback');
    if (fallback) fallback.hidden = true;
    portrait.animation?.cancel();
    if (image.animate) {
      const { keyframes, duration } = portraitTiming(sprite, scale);
      const animation = image.animate(keyframes, { duration, iterations: resource.mode === 'selection' ? 1 : Infinity });
      portrait.animation = animation;
      if (resource.mode === 'selection') animation.addEventListener('finish', () => {
        if (this.disposed || !this.portraits.has(mount) || portrait.animation !== animation) return;
        portrait.celebrating = false;
        this.render(mount, portrait);
      }, { once: true });
      portrait.animation.pause();
      portrait.animation.currentTime = 0;
    }
    this.syncAnimations();
  }

  private syncAnimations(): void {
    const playing = this.active && !this.document.hidden && !this.reducedMotion?.matches;
    for (const { animation } of this.portraits.values()) {
      if (!animation || animation.playState === 'finished') continue;
      if (playing) {
        if (animation.playState !== 'running') animation.play();
      } else {
        if (animation.playState !== 'paused') animation.pause();
        if (this.reducedMotion?.matches) animation.currentTime = 0;
      }
    }
  }
}
