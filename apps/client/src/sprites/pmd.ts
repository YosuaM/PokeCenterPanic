import { PLAYER_CHARACTERS, patientTravelPose, type Direction, type PatientRecord, type PlayerPresence,
  type PlayerPosition, type Point } from '@pokecenter/shared';

export const PATIENT_SPRITES = {
  Pikachu: '0025', Bulbasaur: '0001', Charmander: '0004',
  Squirtle: '0007', Eevee: '0133', Psyduck: '0054',
} as const;

export const PLAYER_SPRITES = PLAYER_CHARACTERS;

/** Pokémon that only decorate the title screen, never the clinic. */
export const SCENERY_SPRITES = { Lugia: '0249' } as const;

export const SPRITE_IDS: Record<string, string> = {
  ...PATIENT_SPRITES, Chansey: '0113', Audino: '0531', Machoke: '0067', Meowth: '0052', ...SCENERY_SPRITES,
};

export function isScenerySpecies(name: string): boolean {
  return Object.hasOwn(SCENERY_SPRITES, name);
}

export interface SpriteAnimation {
  frameWidth: number;
  frameHeight: number;
  durations: number[];
  directions: number;
  image: string;
}

export type SpriteAnimationName = 'Idle' | 'Walk' | 'Dance' | 'Rotate' | 'Laying' | 'Sleep' | 'Hover';

export interface SpeciesSprite {
  id: string;
  name: string;
  credits: string;
  idle: SpriteAnimation;
  walk?: SpriteAnimation;
  selection?: SpriteAnimation;
  /** Pose for patients carried on a stretcher. */
  laying?: SpriteAnimation;
  /** Wing-flapping flight for title-screen flyers. */
  hover?: SpriteAnimation;
}

export interface SpriteManifest {
  source: string;
  species: SpeciesSprite[];
}

export function playerSpriteSpecies(player: PlayerPresence): string {
  return player.character ?? PLAYER_SPRITES[player.slot % PLAYER_SPRITES.length]!;
}

export function patientRenderPosition(patient: PatientRecord, stations: {
  reception: readonly Point[]; waiting: readonly Point[]; recovery: Point;
  healingMachine: Point;
  healingMachines?: readonly Point[];
}, carrier?: Point): Point | undefined {
  const travel = patientTravelPose(patient);
  if (travel) return travel.point;
  if (patient.lifecycle !== 'active') return undefined;
  if (patient.location === 'reception') return stations.reception[patient.slotIndex];
  if (patient.location === 'waiting') return stations.waiting[patient.slotIndex];
  if (patient.location === 'recovery') return patient.slotIndex === 0 ? stations.recovery : undefined;
  if (patient.location === 'healingMachine') return stations.healingMachines ?
    stations.healingMachines[patient.slotIndex] : stations.healingMachine;
  return patient.location === 'carrier' ? carrier : undefined;
}

export function spriteMotion(position: PlayerPosition | undefined, current: Point,
  target: Point): { facing: Direction; moving: boolean } {
  return { facing: position?.facing ?? 'down',
    moving: Math.hypot(target.x - current.x, target.y - current.y) > 0.7 };
}

export function animationRow(facing: Direction, directions: number): number {
  if (directions === 1) return 0;
  if (directions !== 8) throw new Error(`Unsupported PMD direction count: ${directions}`);
  return { down: 0, right: 2, up: 4, left: 6 }[facing];
}

export function parseAnimationXml(xml: string, name: SpriteAnimationName):
  Omit<SpriteAnimation, 'image' | 'directions'> | undefined {
  const block = [...xml.matchAll(/<Anim>([\s\S]*?)<\/Anim>/g)].map((match) => match[1]!)
    .find((content) => /<Name>\s*([^<]+)\s*<\/Name>/.exec(content)?.[1]?.trim() === name);
  if (!block) return undefined;
  if (/<CopyOf>/.test(block)) return undefined;
  const dimension = (tag: string): number => Number(new RegExp(`<${tag}>(\\d+)<\\/${tag}>`).exec(block)?.[1]);
  const frameWidth = dimension('FrameWidth');
  const frameHeight = dimension('FrameHeight');
  const durations = [...block.matchAll(/<Duration>(\d+)<\/Duration>/g)].map((match) => Number(match[1]));
  if (!Number.isSafeInteger(frameWidth) || frameWidth < 2 || !Number.isSafeInteger(frameHeight) ||
    frameHeight < 2 || !durations.length || durations.some((value) => !Number.isSafeInteger(value) || value < 1)) {
    throw new Error(`Malformed PMD ${name} animation metadata`);
  }
  return { frameWidth, frameHeight, durations };
}

export function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 24 || ![137, 80, 78, 71, 13, 10, 26, 10]
    .every((value, index) => bytes[index] === value)) throw new Error('Malformed PMD PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export function validateAnimation(xml: string, name: SpriteAnimationName, bytes: Uint8Array,
  image: string): SpriteAnimation | undefined {
  const parsed = parseAnimationXml(xml, name);
  if (!parsed) return undefined;
  const { width, height } = pngDimensions(bytes);
  if (width !== parsed.frameWidth * parsed.durations.length ||
    (height !== parsed.frameHeight && height !== parsed.frameHeight * 8)) {
    throw new Error(`Malformed PMD ${name} spritesheet: dimensions do not match XML`);
  }
  return { ...parsed, directions: height / parsed.frameHeight, image };
}

export function parseSpriteManifest(value: unknown): SpriteManifest {
  if (!value || typeof value !== 'object') throw new Error('Missing PMD sprite manifest');
  const manifest = value as Partial<SpriteManifest>;
  if (typeof manifest.source !== 'string' || !Array.isArray(manifest.species)) {
    throw new Error('Malformed PMD sprite manifest');
  }
  const validAnimation = (animation: SpriteAnimation | undefined, id: string,
    name: SpriteAnimationName): boolean => Boolean(animation &&
    Number.isSafeInteger(animation.frameWidth) && animation.frameWidth > 1 &&
    Number.isSafeInteger(animation.frameHeight) && animation.frameHeight > 1 &&
    (animation.directions === 1 || animation.directions === 8) &&
    Array.isArray(animation.durations) && animation.durations.length > 0 &&
    animation.durations.every((duration) => Number.isSafeInteger(duration) && duration > 0) &&
    animation.image === `${id}/${name}-Anim.png`);
  for (const species of manifest.species) {
    if (!species || SPRITE_IDS[species.name] !== species.id || !species.credits ||
      !validAnimation(species.idle, species.id, 'Idle') ||
      (species.walk && !validAnimation(species.walk, species.id, 'Walk')) ||
      (species.selection && !validAnimation(species.selection, species.id, 'Dance') &&
        !validAnimation(species.selection, species.id, 'Rotate')) ||
      (species.laying && !validAnimation(species.laying, species.id, 'Laying') &&
        !validAnimation(species.laying, species.id, 'Sleep')) ||
      (species.hover && !validAnimation(species.hover, species.id, 'Hover'))) {
      throw new Error('Malformed PMD sprite manifest entry');
    }
  }
  return manifest as SpriteManifest;
}
