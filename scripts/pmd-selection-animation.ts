import { parseAnimationXml, validateAnimation, type SpriteAnimation, type SpriteAnimationName } from
  '../apps/client/src/sprites/pmd.js';

type LoadedAnimation = { animation: SpriteAnimation; bytes: Uint8Array } | undefined;

export async function loadSelectionAnimation(xml: string, id: string,
  fetchSheet: (name: 'Dance' | 'Rotate') => Promise<Uint8Array>,
  report: (message: string) => void): Promise<LoadedAnimation> {
  return loadFirstAnimation(xml, id, ['Dance', 'Rotate'], fetchSheet, report);
}

/** Lying-down pose for patients on a stretcher; Sleep stands in for species without Laying. */
export async function loadLayingAnimation(xml: string, id: string,
  fetchSheet: (name: 'Laying' | 'Sleep') => Promise<Uint8Array>,
  report: (message: string) => void): Promise<LoadedAnimation> {
  return loadFirstAnimation(xml, id, ['Laying', 'Sleep'], fetchSheet, report);
}

async function loadFirstAnimation<Name extends SpriteAnimationName>(xml: string, id: string, names: readonly Name[],
  fetchSheet: (name: Name) => Promise<Uint8Array>, report: (message: string) => void): Promise<LoadedAnimation> {
  for (const name of names) {
    try {
      if (!parseAnimationXml(xml, name)) continue;
      const bytes = await fetchSheet(name);
      const animation = validateAnimation(xml, name, bytes, `${id}/${name}-Anim.png`);
      if (animation) return { animation, bytes };
    } catch (error) {
      report(`Optional ${name} animation unavailable: ${String(error)}`);
    }
  }
  return undefined;
}
