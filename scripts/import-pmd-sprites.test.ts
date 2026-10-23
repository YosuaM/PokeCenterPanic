import { afterEach, expect, it, vi } from 'vitest';

const files = vi.hoisted(() => ({ mkdir: vi.fn(async () => {}), writeFile: vi.fn<(path: string, data: string | Uint8Array) => Promise<void>>(async () => {}) }));
vi.mock('node:fs/promises', () => files);

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('imports selection sheets for player species and stretcher poses for patients alongside Idle and Walk', async () => {
  vi.resetModules(); vi.clearAllMocks();
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const playerIds = ['0113', '0531', '0067', '0052'];
  const definition = (name: string) => `<Anim><Name>${name}</Name><FrameWidth>16</FrameWidth>
    <FrameHeight>24</FrameHeight><Durations><Duration>4</Duration><Duration>8</Duration></Durations></Anim>`;
  const request = vi.fn(async (url: string) => {
    if (url.endsWith('AnimData.xml')) {
      return new Response(definition('Idle') + definition('Walk') + definition('Dance') + definition('Rotate') +
        (url.includes('/0054/') ? definition('Sleep') : definition('Laying')));
    }
    if (url.endsWith('credits.txt')) return new Response('Fixture artist');
    if (url.endsWith('0052/Dance-Anim.png')) return new Response(null, { status: 404 });
    const bytes = new Uint8Array(24);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 32); view.setUint32(20, 24);
    return new Response(bytes);
  });
  vi.stubGlobal('fetch', request);
  await import('./import-pmd-sprites.js');
  await vi.waitFor(() => expect(files.writeFile.mock.calls.some(([path]) => String(path).endsWith('manifest.json'))).toBe(true));
  const writes = files.writeFile.mock.calls;
  const manifest = JSON.parse(String(writes.find(([path]) => path.endsWith('manifest.json'))![1]));
  expect(manifest.species).toHaveLength(10);
  for (const species of manifest.species) {
    expect(species.idle.image).toBe(`${species.id}/Idle-Anim.png`);
    expect(species.walk.image).toBe(`${species.id}/Walk-Anim.png`);
    expect(species.credits).toBe('Fixture artist');
    if (playerIds.includes(species.id)) {
      expect(species.selection.image).toBe(`${species.id}/${species.id === '0052' ? 'Rotate' : 'Dance'}-Anim.png`);
      expect(writes.some(([path]) => path.endsWith(species.selection.image))).toBe(true);
      expect(species.laying).toBeUndefined();
    } else {
      expect(species.selection).toBeUndefined();
      expect(species.laying.image).toBe(`${species.id}/${species.id === '0054' ? 'Sleep' : 'Laying'}-Anim.png`);
      expect(writes.some(([path]) => path.endsWith(species.laying.image))).toBe(true);
    }
  }
  expect(request.mock.calls.filter(([url]) => /(?:Dance|Rotate)-Anim.png$/.test(url))).toHaveLength(5);
  expect(request.mock.calls.filter(([url]) => /(?:Laying|Sleep)-Anim.png$/.test(url))).toHaveLength(6);
});
