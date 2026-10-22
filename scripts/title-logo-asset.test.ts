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

it('ships a self-contained animated SVG with the original image and shared motion styles', () => {
  const svg = readFileSync(new URL('../art/exports/pokecenter-panic-logo-animated.svg', import.meta.url), 'utf8');
  const motion = readFileSync(new URL('../apps/client/src/ui/logo-motion.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../apps/client/index.html', import.meta.url), 'utf8');
  expect(html).toContain('href="/src/ui/logo-motion.css"');
  expect(svg).toContain(`<style>${motion}</style>`);
  expect(svg).toContain(`viewBox="0 0 ${width} ${height}"`);
  expect(svg).toContain('<title id="title">PokéCenter Panic</title>');
  const embeddedImage = svg.match(/href="data:image\/webp;base64,([^"]+)"/)?.[1];
  expect(embeddedImage).toBeDefined();
  expect(Buffer.from(embeddedImage!, 'base64')).toEqual(runtime);
  expect(svg).not.toMatch(/<script|href="https?:/);
});

it('exports a transparent eight-second WebP loop with distinct animation frames', () => {
  const animation = readFileSync(new URL('../art/exports/pokecenter-panic-logo-animated.webp', import.meta.url));
  expect(animation.toString('ascii', 0, 4)).toBe('RIFF');
  expect(animation.toString('ascii', 8, 12)).toBe('WEBP');
  expect(animation[20]! & 0x12).toBe(0x12);
  expect(animation.readUIntLE(24, 3) + 1).toBe(888);
  expect(animation.readUIntLE(27, 3) + 1).toBe(444);
  const frames: Buffer[] = [];
  let duration = 0;
  let loopCount: number | undefined;
  for (let offset = 12; offset + 8 <= animation.length;) {
    const type = animation.toString('ascii', offset, offset + 4);
    const size = animation.readUInt32LE(offset + 4);
    const payload = animation.subarray(offset + 8, offset + 8 + size);
    if (type === 'ANIM') loopCount = payload.readUInt16LE(4);
    if (type === 'ANMF') {
      duration += payload.readUIntLE(12, 3);
      frames.push(payload);
    }
    offset += 8 + size + (size % 2);
  }
  expect(loopCount).toBe(0);
  expect(duration).toBe(8000);
  expect(frames.length).toBeGreaterThan(100);
  expect(frames[0]!.equals(frames[40]!)).toBe(false);
});
