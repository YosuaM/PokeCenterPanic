export const ART_WIDTH = 1672;
export const ART_HEIGHT = 941;
export interface Region { x: number; y: number; width: number; height: number }

export const CHIMNEY = { x: 250, y: 160 } as const;
export const SMOKE: Region = { x: 145, y: 5, width: 140, height: 158 };
export const SMOKE_COUNT = 6;
export const SMOKE_SECONDS = 8;
export const LIGHTS = [
  { x: 124, y: 774, radius: 52 }, { x: 261, y: 620, radius: 27 },
  { x: 653, y: 666, radius: 36 }, { x: 936, y: 550, radius: 22 },
  { x: 1030, y: 617, radius: 19 }, { x: 472, y: 477, radius: 18 },
  { x: 655, y: 478, radius: 18 }, { x: 561, y: 551, radius: 65 },
] as const;

export function smokePuff(seconds: number, index: number) {
  const age = ((seconds + index * SMOKE_SECONDS / SMOKE_COUNT) % SMOKE_SECONDS + SMOKE_SECONDS) % SMOKE_SECONDS / SMOKE_SECONDS;
  return {
    x: CHIMNEY.x - age * 28 + Math.sin(age * 5) * age * 4,
    y: CHIMNEY.y - age * 48,
    scale: .25 + age * .85,
    opacity: Math.sin(Math.PI * age) * .32,
  };
}

export function lightStrength(seconds: number, index: number): number {
  return .1 + .05 * Math.sin(seconds * 1.9 + index * 1.7) +
    .02 * Math.sin(seconds * 4.1 + index * .9);
}
