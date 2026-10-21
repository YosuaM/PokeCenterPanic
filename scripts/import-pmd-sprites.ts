import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPRITE_IDS, validateAnimation, type SpeciesSprite, type SpriteManifest } from
  '../apps/client/src/sprites/pmd.js';

const root = fileURLToPath(new URL('../apps/client/public/assets/external/pmd/', import.meta.url));
const source = 'https://github.com/PMDCollab/SpriteCollab';
const raw = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite';

async function fetchResource(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function main(): Promise<void> {
  const species: SpeciesSprite[] = [];
  for (const [name, id] of Object.entries(SPRITE_IDS)) {
    const directory = join(root, id);
    const base = `${raw}/${id}`;
    const [xmlBytes, creditBytes, idleBytes] = await Promise.all([
      fetchResource(`${base}/AnimData.xml`), fetchResource(`${base}/credits.txt`),
      fetchResource(`${base}/Idle-Anim.png`),
    ]);
    const xml = new TextDecoder().decode(xmlBytes);
    const credits = new TextDecoder().decode(creditBytes).trim();
    if (!credits) throw new Error(`${name}: missing sprite artist credits`);
    const idle = validateAnimation(xml, 'Idle', idleBytes, `${id}/Idle-Anim.png`);
    if (!idle) throw new Error(`${name}: missing Idle animation`);
    const walkDefinition = /<Name>\s*Walk\s*<\/Name>/.test(xml);
    let walk;
    let walkBytes;
    if (walkDefinition) {
      try {
        walkBytes = await fetchResource(`${base}/Walk-Anim.png`);
        walk = validateAnimation(xml, 'Walk', walkBytes, `${id}/Walk-Anim.png`);
      } catch (error) {
        process.stderr.write(`${name}: optional Walk animation unavailable: ${String(error)}\n`);
      }
    }
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'Idle-Anim.png'), idleBytes);
    if (walk && walkBytes) await writeFile(join(directory, 'Walk-Anim.png'), walkBytes);
    await writeFile(join(directory, 'credits.txt'), `${credits}\n`);
    species.push({ id, name, credits, idle, ...(walk ? { walk } : {}) });
    process.stdout.write(`${name}: idle${walk ? ', walk' : ''}\n`);
  }
  const manifest: SpriteManifest = { source, species };
  await writeFile(join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`Local PMD cache ready: ${species.length} species\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`PMD import failed: ${String(error)}\n`);
  process.exitCode = 1;
});
