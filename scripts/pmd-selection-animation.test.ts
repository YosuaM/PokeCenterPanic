import { describe, expect, it, vi } from 'vitest';
import { loadHoverAnimation, loadLayingAnimation, loadSelectionAnimation } from './pmd-selection-animation.js';

const definition = (name: string) => `<Anim><Name>${name}</Name><FrameWidth>16</FrameWidth>
<FrameHeight>24</FrameHeight><Durations><Duration>4</Duration><Duration>8</Duration></Durations></Anim>`;
function png(width = 32, height = 24): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width); view.setUint32(20, height);
  return bytes;
}

describe('selection animation import', () => {
  it('prefers a real Dance animation and preserves its sheet metadata', async () => {
    const bytes = png();
    const request = vi.fn(async () => bytes);
    const report = vi.fn();
    expect(await loadSelectionAnimation(definition('Dance') + definition('Rotate'), '0113', request, report))
      .toEqual({ bytes, animation: { frameWidth: 16, frameHeight: 24, directions: 1,
        durations: [4, 8], image: '0113/Dance-Anim.png' } });
    expect(request).toHaveBeenCalledExactlyOnceWith('Dance');
    expect(report).not.toHaveBeenCalled();
  });

  it('uses Rotate when Dance is absent, an alias, unavailable or malformed', async () => {
    for (const failure of ['absent', 'alias', 'http', 'dimensions', 'metadata'] as const) {
      let xml = definition('Rotate');
      if (failure === 'alias') xml += '<Anim><Name>Dance</Name><CopyOf>Rotate</CopyOf></Anim>';
      else if (failure !== 'absent') xml += failure === 'metadata' ? definition('Dance').replace('<Duration>4</Duration>', '<Duration>0</Duration>') : definition('Dance');
      const request = vi.fn(async (name: 'Dance' | 'Rotate') => {
        if (name === 'Dance') {
          if (failure === 'http') throw new Error('HTTP 404');
          if (failure === 'dimensions') return png(1);
        }
        return png();
      });
      const report = vi.fn();
      const result = await loadSelectionAnimation(xml, '0052', request, report);
      expect(result?.animation.image).toBe('0052/Rotate-Anim.png');
      expect(request).toHaveBeenLastCalledWith('Rotate');
      expect(report).toHaveBeenCalledTimes(['absent', 'alias'].includes(failure) ? 0 : 1);
    }
  });

  it('keeps the importer usable when neither celebration can be imported', async () => {
    const request = vi.fn(async () => { throw new Error('Offline'); });
    const report = vi.fn();
    expect(await loadSelectionAnimation(definition('Dance') + definition('Rotate'), '0531', request, report)).toBeUndefined();
    expect(report).toHaveBeenCalledTimes(2);
    request.mockClear();
    expect(await loadSelectionAnimation(definition('Idle'), '0531', request, report)).toBeUndefined();
    expect(request).not.toHaveBeenCalled();
  });

  it('imports the Laying stretcher pose, falling back to Sleep for species without one', async () => {
    const request = vi.fn(async () => png());
    const report = vi.fn();
    expect((await loadLayingAnimation(definition('Laying') + definition('Sleep'), '0025', request, report))?.animation.image)
      .toBe('0025/Laying-Anim.png');
    expect(request).toHaveBeenCalledExactlyOnceWith('Laying');
    expect((await loadLayingAnimation(definition('Sleep'), '0054', request, report))?.animation.image).toBe('0054/Sleep-Anim.png');
    expect(await loadLayingAnimation(definition('Idle'), '0054', request, report)).toBeUndefined();
    expect(report).not.toHaveBeenCalled();
  });

  it('imports Hover for flyers and reports an unavailable sheet without failing', async () => {
    const report = vi.fn();
    const request = vi.fn(async () => png());
    expect((await loadHoverAnimation(definition('Hover'), '0249', request, report))?.animation.image).toBe('0249/Hover-Anim.png');
    expect(request).toHaveBeenCalledExactlyOnceWith('Hover');
    expect(await loadHoverAnimation(definition('Walk'), '0249', request, report)).toBeUndefined();
    const missing = vi.fn(async () => { throw new Error('404'); });
    expect(await loadHoverAnimation(definition('Hover'), '0249', missing, report)).toBeUndefined();
    expect(report).toHaveBeenCalledWith(expect.stringContaining('Optional Hover animation unavailable'));
  });
});
