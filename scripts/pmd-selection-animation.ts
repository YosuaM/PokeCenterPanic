import { parseAnimationXml, validateAnimation, type SpriteAnimation } from
  '../apps/client/src/sprites/pmd.js';

export async function loadSelectionAnimation(xml: string, id: string,
  fetchSheet: (name: 'Dance' | 'Rotate') => Promise<Uint8Array>,
  report: (message: string) => void): Promise<{ animation: SpriteAnimation; bytes: Uint8Array } | undefined> {
  for (const name of ['Dance', 'Rotate'] as const) {
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
