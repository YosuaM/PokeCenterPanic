import { describe, expect, it, vi } from 'vitest';
import { SoftPatientAudio } from './patientAlertAudio.js';
import { bindPatientAudioControls } from './patientAudioControls.js';

class Control extends EventTarget {
  textContent = '';
  title = '';
  value = '35';
  attributes = new Map<string, string>();
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
}

function setup(saved: string | null = null) {
  const button = new Control();
  const volume = new Control();
  const gestures = new EventTarget();
  const visibility = Object.assign(new EventTarget(), { hidden: false });
  const storage = { getItem: vi.fn(() => saved), setItem: vi.fn() };
  const audio = { muted: false, volume: 0.35, unlock: vi.fn(async () => true), stop: vi.fn(),
    setMuted: vi.fn((value: boolean) => { audio.muted = value; }),
    setVolume: vi.fn((value: number) => { audio.volume = value; }) };
  const bind = () => bindPatientAudioControls(audio as unknown as SoftPatientAudio,
    button as unknown as HTMLButtonElement, volume as unknown as HTMLInputElement,
    storage as unknown as Storage, gestures, visibility as unknown as Document);
  return { button, volume, gestures, visibility, storage, audio, bind };
}

describe('patient audio controls', () => {
  it('restores and saves mute and volume while keeping accessible labels current', () => {
    const { button, volume, storage, audio, bind } = setup('{"muted":true,"volume":0.2}');
    bind();
    expect(button.textContent).toBe('SOUND OFF');
    expect(button.attributes.get('aria-pressed')).toBe('false');
    expect(volume.value).toBe('20');
    button.dispatchEvent(new Event('click'));
    expect(button.textContent).toBe('SOUND ON');
    expect(audio.unlock).toHaveBeenCalledOnce();
    volume.value = '15';
    volume.dispatchEvent(new Event('input'));
    expect(audio.volume).toBe(0.15);
    expect(volume.attributes.get('aria-valuetext')).toBe('15 percent');
    expect(storage.setItem).toHaveBeenLastCalledWith('pokecenter.patient-audio', '{"muted":false,"volume":0.15}');
  });

  it('unlocks from a gesture, isolates control keys and recovers from zero volume', () => {
    const { button, volume, gestures, audio, bind } = setup();
    bind();
    expect(audio.unlock).not.toHaveBeenCalled();
    gestures.dispatchEvent(new Event('pointerdown'));
    expect(audio.unlock).toHaveBeenCalledOnce();
    const key = new Event('keydown');
    const stop = vi.spyOn(key, 'stopPropagation');
    volume.dispatchEvent(key);
    expect(stop).toHaveBeenCalledOnce();
    expect(audio.unlock).toHaveBeenCalledTimes(2);
    expect(key.defaultPrevented).toBe(false);
    volume.value = '0';
    volume.dispatchEvent(new Event('input'));
    expect(button.textContent).toBe('SOUND OFF');
    button.dispatchEvent(new Event('click'));
    expect(audio.volume).toBe(0.35);
    expect(button.textContent).toBe('SOUND ON');
  });

  it('silences a hidden page and removes all UI and gesture listeners on shutdown', () => {
    const { button, volume, visibility, gestures, audio, bind } = setup();
    const release = bind();
    visibility.hidden = true;
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(audio.stop).toHaveBeenCalledOnce();
    release();
    gestures.dispatchEvent(new Event('keydown'));
    gestures.dispatchEvent(new Event('pointerdown'));
    button.dispatchEvent(new Event('click'));
    volume.dispatchEvent(new Event('input'));
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(audio.unlock).not.toHaveBeenCalled();
    expect(audio.setVolume).not.toHaveBeenCalled();
    expect(audio.stop).toHaveBeenCalledOnce();
  });

  it('keeps working with invalid or denied settings storage', () => {
    const { button, storage, bind } = setup('not json');
    storage.getItem.mockImplementationOnce(() => { throw new Error('Denied'); });
    storage.setItem.mockImplementation(() => { throw new Error('Denied'); });
    expect(() => bind()).not.toThrow();
    expect(button.textContent).toBe('SOUND ON');
    expect(() => button.dispatchEvent(new Event('click'))).not.toThrow();
    expect(button.textContent).toBe('SOUND OFF');
    expect(() => setup('not json').bind()).not.toThrow();
  });
});
