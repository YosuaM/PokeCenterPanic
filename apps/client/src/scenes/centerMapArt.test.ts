import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAP_OBSTACLES } from '@pokecenter/shared';
import { pngDimensions } from '../sprites/pmd.js';

const source = readFileSync(new URL('../../../../art/source/center-map.svg', import.meta.url), 'utf8');
const texture = readFileSync(new URL('../../public/assets/original/center-map.png', import.meta.url));

describe('original center environment art', () => {
  it('exports one texture at the fixed map resolution', () => {
    expect(pngDimensions(texture)).toEqual({ width: 960, height: 540 });
    for (const layer of ['center-floor', 'center-fixtures']) {
      const png = readFileSync(new URL(`../../public/assets/original/${layer}.png`, import.meta.url));
      expect(pngDimensions(png)).toEqual({ width: 960, height: 540 });
    }
  });

  it('exports equipment at native PMD-compatible pixel sizes', () => {
    const asset = (name: string) => readFileSync(new URL(`../../public/assets/original/${name}.png`, import.meta.url));
    expect(pngDimensions(asset('stretcher'))).toEqual({ width: 48, height: 24 });
    expect(pngDimensions(asset('medicine-bottle'))).toEqual({ width: 20, height: 28 });
    for (const name of ['heal', 'burn', 'poison', 'ready']) {
      expect(pngDimensions(asset(`icon-${name}`))).toEqual({ width: 16, height: 16 });
    }
    expect(pngDimensions(asset('icon-complete'))).toEqual({ width: 8, height: 8 });
  });

  it('keeps station art bounds aligned with the server collision geometry', () => {
    const matches = [...source.matchAll(/<rect data-obstacle="(\d+)" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g)];
    expect(matches).toHaveLength(MAP_OBSTACLES.length);
    for (const [index, obstacle] of MAP_OBSTACLES.entries()) {
      const match = matches[index]!;
      expect(Number(match[1])).toBe(index);
      expect([Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5])])
        .toEqual([obstacle.x, obstacle.y, obstacle.width, obstacle.height]);
    }
  });
});
