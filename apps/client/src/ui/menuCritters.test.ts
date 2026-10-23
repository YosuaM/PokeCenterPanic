import { describe, expect, it, vi } from 'vitest';
import { drawCritters, drawFlyers, loadMenuCritters } from './menuCritters.js';
import { FLIGHT_START_SECONDS, critterPoses, flyerPose } from './menuCrittersModel.js';
import { SPRITE_IDS } from '../sprites/pmd.js';

const sprite = (frames = 2) => ({ frameWidth: 4, frameHeight: 4, durations: Array(frames).fill(30), directions: 8 });

function context() {
  return { imageSmoothingEnabled: true, globalAlpha: 1, fillStyle: '', beginPath: vi.fn(), ellipse: vi.fn(), fill: vi.fn(),
    drawImage: vi.fn() };
}

/** 8 × 32 sheet whose first row has a pixel at y = 2, so the feet line is 3. */
function fakeDocument(failDecode = new Set<string>()) {
  return { createElement: (tag: string) => tag === 'canvas' ? {
    width: 0, height: 0,
    getContext: () => ({ drawImage: vi.fn(), getImageData: (_x: number, _y: number, width: number, height: number) => {
      const data = new Uint8ClampedArray(width * height * 4);
      data[(2 * width + 1) * 4 + 3] = 255;
      return { data };
    } }),
  } : {
    naturalWidth: 8, naturalHeight: 32, src: '',
    decode(this: { src: string }) {
      return [...failDecode].some((name) => this.src.includes(name)) ? Promise.reject(new Error('404')) : Promise.resolve();
    },
  } } as unknown as Document;
}

function manifest(species: string[], frames = 2) {
  return { source: 'fixture', species: species.map((name) => ({ id: SPRITE_IDS[name], name, credits: 'Artist',
    idle: { ...sprite(frames), image: `${SPRITE_IDS[name]}/Idle-Anim.png` },
    walk: { ...sprite(frames), image: `${SPRITE_IDS[name]}/Walk-Anim.png` } })) };
}

describe('drawCritters', () => {
  it('draws a shadow and the current frame, row and feet-anchored position for each pose, back to front', () => {
    const target = context();
    const image = {} as CanvasImageSource;
    const sheets = new Map(['Chansey', 'Meowth', 'Pikachu'].map((name) => [name, {
      idle: { sprite: { ...sprite(), image: '' }, image, feet: 3 }, walk: { sprite: { ...sprite(), image: '' }, image, feet: 3 },
    }]));
    drawCritters(target as unknown as CanvasRenderingContext2D, sheets, 4);
    expect(target.imageSmoothingEnabled).toBe(false);
    const poses = critterPoses(4);
    expect(target.drawImage).toHaveBeenCalledTimes(poses.length);
    expect(target.ellipse).toHaveBeenCalledTimes(poses.length);
    for (const [index, pose] of poses.entries()) {
      const [, sx, sy, , , dx, dy, dw] = target.drawImage.mock.calls[index]!;
      expect(sy).toBe(pose.row * 4);
      expect([0, 4]).toContain(sx);
      expect(dx).toBe(Math.round(pose.x - (4 * pose.scale) / 2));
      expect(dy).toBe(Math.round(pose.y - 3 * pose.scale));
      expect(dw).toBe(Math.round(4 * pose.scale));
    }
    expect(target.globalAlpha).toBe(1);
  });

  it('falls back to idle, uses row 0 for single-direction sheets and skips species without sprites', () => {
    const target = context();
    const single = { sprite: { ...sprite(), directions: 1, image: '' }, image: {} as CanvasImageSource, feet: 4 };
    drawCritters(target as unknown as CanvasRenderingContext2D, new Map([['Meowth', { idle: single }]]), 1);
    expect(target.drawImage).toHaveBeenCalledOnce();
    expect(target.drawImage.mock.calls[0]![2]).toBe(0);
  });
});

describe('drawFlyers', () => {
  it('draws Lugia centred, without a ground shadow, only while it is crossing the sky', () => {
    const target = context();
    const lugia = { sprite: { ...sprite(), image: '' }, image: {} as CanvasImageSource, feet: 3 };
    const sheets = new Map([['Lugia', { walk: lugia }]]);
    expect(drawFlyers(target as unknown as CanvasRenderingContext2D, sheets, 0)).toBeNull();
    expect(target.drawImage).not.toHaveBeenCalled();
    const time = FLIGHT_START_SECONDS + 4;
    const box = drawFlyers(target as unknown as CanvasRenderingContext2D, sheets, time);
    const pose = flyerPose(time)!;
    expect(box).toEqual({ x: Math.round(pose.x - (4 * pose.scale) / 2), y: Math.round(pose.y - 2 * pose.scale),
      width: Math.round(4 * pose.scale), height: Math.round(4 * pose.scale) });
    expect(drawFlyers(target as unknown as CanvasRenderingContext2D, new Map(), time)).toBeNull();
    expect(target.drawImage).toHaveBeenCalledOnce();
    expect(target.drawImage.mock.calls[0]![2]).toBe(pose.row * 4);
    expect(target.drawImage.mock.calls[0]![5]).toBe(Math.round(pose.x - (4 * pose.scale) / 2));
    expect(target.drawImage.mock.calls[0]![6]).toBe(Math.round(pose.y - 2 * pose.scale));
    expect(target.ellipse).not.toHaveBeenCalled();
  });

  it('switches between the flapping and gliding sheets, gliding when Hover is missing', () => {
    const glide = { sprite: { ...sprite(), image: '' }, image: { name: 'walk' } as unknown as CanvasImageSource, feet: 3 };
    const flap = { sprite: { ...sprite(), image: '' }, image: { name: 'hover' } as unknown as CanvasImageSource, feet: 1 };
    const climb = Array.from({ length: 40 }, (_, step) => FLIGHT_START_SECONDS + step * 0.25)
      .find((time) => flyerPose(time)!.animation === 'hover')!;
    const both = context();
    drawFlyers(both as unknown as CanvasRenderingContext2D, new Map([['Lugia', { walk: glide, hover: flap }]]), climb);
    expect(both.drawImage.mock.calls[0]![0]).toBe(flap.image);
    const only = context();
    drawFlyers(only as unknown as CanvasRenderingContext2D, new Map([['Lugia', { walk: glide }]]), climb);
    expect(only.drawImage.mock.calls[0]![0]).toBe(glide.image);
    expect(only.drawImage.mock.calls[0]![6]).toBe(both.drawImage.mock.calls[0]![6]);
  });
});

describe('loadMenuCritters', () => {
  it('loads idle and walk sheets with their feet line for the scene species', async () => {
    const request = vi.fn(async () => ({ ok: true, json: async () => manifest(['Chansey', 'Meowth', 'Pikachu', 'Audino']) }));
    const critters = await loadMenuCritters(fakeDocument(), request as unknown as typeof fetch);
    expect(request).toHaveBeenCalledWith('/assets/external/pmd/manifest.json');
    const target = context();
    critters!.draw(target as unknown as CanvasRenderingContext2D, 4);
    expect(target.drawImage).toHaveBeenCalledTimes(3);
    critters!.drawSky(target as unknown as CanvasRenderingContext2D, FLIGHT_START_SECONDS + 4);
    expect(target.drawImage).toHaveBeenCalledTimes(3);
    const chansey = critterPoses(4).findIndex((pose) => pose.species === 'Chansey');
    const pose = critterPoses(4)[chansey]!;
    expect(target.drawImage.mock.calls[chansey]![6]).toBe(Math.round(pose.y - 3 * pose.scale));
  });

  it('stays still without a cache, with a broken manifest, or when every sheet is missing or mis-sized', async () => {
    const respond = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
    expect(await loadMenuCritters(fakeDocument(), respond({}, false))).toBeNull();
    expect(await loadMenuCritters(fakeDocument(), respond({ species: 'nope' }))).toBeNull();
    expect(await loadMenuCritters(fakeDocument(), vi.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch)).toBeNull();
    expect(await loadMenuCritters(fakeDocument(new Set(['Idle', 'Walk'])), respond(manifest(['Chansey'])))).toBeNull();
    expect(await loadMenuCritters(fakeDocument(), respond(manifest(['Chansey'], 3)))).toBeNull();
  });
});
