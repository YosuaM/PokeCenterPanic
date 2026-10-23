import { parseSpriteManifest, type SpriteAnimation } from '../sprites/pmd.js';
import { portraitBounds } from './characterPortraits.js';
import type { Region } from './menuAtmosphereModel.js';
import { PATIENT_SPECIES, critterPoses, flyerPose, frameAt, type CritterPose } from './menuCrittersModel.js';

interface Sheet { sprite: SpriteAnimation; image: CanvasImageSource; feet: number }
type Mode = 'idle' | 'walk' | 'hover';
type Sheets = Map<string, Partial<Record<Mode, Sheet>>>;

export interface MenuCritters {
  /** Ground Pokémon, drawn over the clinic/path and behind foreground trees. */
  draw(context: CanvasRenderingContext2D, seconds: number): void;
  /** Flying Pokémon, drawn in front of the clouds; returns the area painted, or null when nobody flies. */
  drawSky(context: CanvasRenderingContext2D, seconds: number): Region | null;
}

const SPECIES = ['Chansey', 'Meowth', 'Lugia', ...PATIENT_SPECIES];

/** Feet line of a sheet: the lowest opaque pixel of its first row, so sprites stand on the path. */
function feetLine(document: Document, image: HTMLImageElement, sprite: SpriteAnimation): number {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = sprite.frameHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return sprite.frameHeight;
    context.drawImage(image, 0, 0);
    const bounds = portraitBounds(context.getImageData(0, 0, canvas.width, canvas.height).data,
      canvas.width, canvas.height, sprite.frameWidth);
    canvas.width = canvas.height = 0;
    return bounds ? bounds.y + bounds.height : sprite.frameHeight;
  } catch { return sprite.frameHeight; }
}

export function drawCritters(context: CanvasRenderingContext2D, sheets: Sheets, seconds: number): void {
  drawPoses(context, sheets, critterPoses(seconds), true);
}

export function drawFlyers(context: CanvasRenderingContext2D, sheets: Sheets, seconds: number): Region | null {
  const flyer = flyerPose(seconds);
  return flyer ? drawPoses(context, sheets, [flyer], false) : null;
}

/** Draws the poses and returns the box they cover, or null when none had a sheet. */
function drawPoses(context: CanvasRenderingContext2D, sheets: Sheets, poses: readonly CritterPose[],
  shadows: boolean): Region | null {
  let box: Region | null = null;
  context.imageSmoothingEnabled = false;
  for (const pose of poses) {
    const set = sheets.get(pose.species);
    const sheet = set?.[pose.animation] ?? (pose.animation === 'hover' ? set?.walk : undefined) ?? set?.idle;
    if (!sheet || pose.alpha <= 0) continue;
    const { sprite } = sheet;
    const row = sprite.directions === 8 ? pose.row : 0;
    const frame = frameAt(sprite.durations, pose.clock);
    const width = sprite.frameWidth * pose.scale, height = sprite.frameHeight * pose.scale;
    if (shadows) {
      context.globalAlpha = pose.alpha * 0.32;
      context.fillStyle = '#120c24';
      context.beginPath();
      context.ellipse(pose.x, pose.y, 9 * pose.scale, 3.5 * pose.scale, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = pose.alpha;
    // Walkers stand on their feet; flyers are centred so switching between flight sheets never jolts them.
    const anchor = shadows ? sheet.feet : sprite.frameHeight / 2;
    const drawn = { x: Math.round(pose.x - width / 2), y: Math.round(pose.y - anchor * pose.scale),
      width: Math.round(width), height: Math.round(height) };
    context.drawImage(sheet.image, frame * sprite.frameWidth, row * sprite.frameHeight, sprite.frameWidth, sprite.frameHeight,
      drawn.x, drawn.y, drawn.width, drawn.height);
    box = box ? union(box, drawn) : drawn;
  }
  context.globalAlpha = 1;
  return box;
}

function union(a: Region, b: Region): Region {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

/** Loads the local PMD sheets; resolves to null when the sprite cache is absent so the scene stays still. */
export async function loadMenuCritters(document: Document, request: typeof fetch = fetch): Promise<MenuCritters | null> {
  try {
    const response = await request('/assets/external/pmd/manifest.json');
    if (!response.ok) return null;
    const manifest = parseSpriteManifest(await response.json());
    const sheets: Sheets = new Map();
    await Promise.all(SPECIES.flatMap((name) => {
      const species = manifest.species.find((entry) => entry.name === name);
      return (['idle', 'walk', 'hover'] as const).map(async (mode) => {
        const sprite = species?.[mode];
        if (!sprite) return;
        const image = document.createElement('img');
        image.src = `/assets/external/pmd/${sprite.image}`;
        try { await image.decode(); } catch { return; }
        if (image.naturalWidth !== sprite.frameWidth * sprite.durations.length ||
          image.naturalHeight !== sprite.frameHeight * sprite.directions) return;
        const entry = sheets.get(name) ?? {};
        entry[mode] = { sprite, image, feet: feetLine(document, image, sprite) };
        sheets.set(name, entry);
      });
    }));
    return sheets.size ? { draw: (context, seconds) => drawCritters(context, sheets, seconds),
      drawSky: (context, seconds) => drawFlyers(context, sheets, seconds) } : null;
  } catch { return null; }
}
