import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));

describe('original art exporter', () => {
  it.skipIf(process.platform !== 'darwin')('keeps tracked PNGs in sync with their SVG sources', () => {
    const output = mkdtempSync(join(tmpdir(), 'pokecenter-art-'));
    try {
      execFileSync('swift', ['scripts/export-original-art.swift', output], {
        cwd: root,
        env: { ...process.env,
          SWIFT_MODULE_CACHE_PATH: join(tmpdir(), 'pokecenter-swift-cache'),
          CLANG_MODULE_CACHE_PATH: join(tmpdir(), 'pokecenter-clang-cache') },
      });
      for (const name of ['center-map', 'center-floor', 'center-fixtures',
        'stretcher', 'medicine-bottle']) {
        const tracked = readFileSync(join(root, 'apps/client/public/assets/original', `${name}.png`));
        expect(readFileSync(join(output, `${name}.png`))).toEqual(tracked);
      }
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });
});
