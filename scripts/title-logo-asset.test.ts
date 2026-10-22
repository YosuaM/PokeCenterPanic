import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const source = readFileSync(new URL('../art/source/pokecenter-panic-logo.png', import.meta.url));
const runtime = readFileSync(new URL('../apps/client/public/assets/original/pokecenter-panic-logo.webp', import.meta.url));
const width = source.readUInt32BE(16);
const height = source.readUInt32BE(20);

it('preserves the title logo dimensions and alpha in an optimized local WebP', () => {
  expect([...source.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(source[25]).toBe(6);
  expect(width).toBeGreaterThan(1000);
  expect(width / height).toBe(2);
  expect(runtime.toString('ascii', 0, 4)).toBe('RIFF');
  expect(runtime.toString('ascii', 8, 16)).toBe('WEBPVP8X');
  expect(runtime[20]! & 0x10).toBe(0x10);
  expect(runtime.readUIntLE(24, 3) + 1).toBe(width);
  expect(runtime.readUIntLE(27, 3) + 1).toBe(height);
  expect(runtime.length).toBeLessThan(350_000);
});

it('shares the logo in the header and accessible title with explicit dimensions to prevent layout shifts', () => {
  const html = readFileSync(new URL('../apps/client/index.html', import.meta.url), 'utf8');
  const images = html.match(/<img[^>]+src="\/assets\/original\/pokecenter-panic-logo.webp"[^>]*>/g)!;
  expect(images).toHaveLength(2);
  for (const image of images) expect(image).toContain(`width="${width}" height="${height}"`);
  expect(html).toContain('aria-label="PokéCenter Panic home"');
  expect(html).toMatch(/<h1 class="game-logo"><img[^>]+alt="PokéCenter Panic"[^>]+fetchpriority="high"/);
  expect(html).not.toContain('logo-sticker');
});
