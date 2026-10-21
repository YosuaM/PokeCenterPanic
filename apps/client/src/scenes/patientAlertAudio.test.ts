import { describe, expect, it, vi } from 'vitest';
import { type PatientRecord } from '@pokecenter/shared';
import { PATIENT_CUE_NOTES, PatientSoundTransitions, SoftPatientAudio } from './patientAlertAudio.js';

const patient: PatientRecord = { id: 'p1', species: 'Pikachu', requiredTreatments: 3,
  completedTreatments: 0, lifecycle: 'active', location: 'waiting', slotIndex: 0,
  carrierId: '', initialPatienceMs: 90000, remainingPatienceMs: 45000 };

function fakeContext() {
  const parameter = () => ({ setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
  const createGain = vi.fn(() => ({ gain: parameter(), connect: vi.fn(), disconnect: vi.fn() }));
  const createOscillator = vi.fn(() => ({ frequency: parameter(), type: '', connect: vi.fn(),
    disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null }));
  const context = { state: 'running', currentTime: 5, destination: {}, createGain, createOscillator,
    resume: vi.fn(async () => { context.state = 'running'; }), close: vi.fn() };
  return { context, audio: new SoftPatientAudio(() => context as unknown as AudioContext) };
}

describe('patient sound transitions', () => {
  it('plays only critical entry and full-care completion, grouping same-kind patients', () => {
    const transitions = new PatientSoundTransitions();
    const second = { ...patient, id: 'p2' };
    expect(transitions.sync([patient, second])).toEqual([]);
    const critical = { ...patient, remainingPatienceMs: 22500 };
    expect(transitions.sync([critical, { ...critical, id: 'p2' }])).toEqual(['critical']);
    expect(transitions.sync([critical, { ...critical, id: 'p2' }])).toEqual([]);
    expect(transitions.sync([{ ...critical, completedTreatments: 1 }])).toEqual([]);
    expect(transitions.sync([{ ...critical, completedTreatments: 3 }])).toEqual(['ready']);
  });

  it('suppresses initial/reconnected states, losses, depleted patience and removed patients', () => {
    const transitions = new PatientSoundTransitions();
    const ready = { ...patient, remainingPatienceMs: 10000, completedTreatments: 3 };
    expect(transitions.sync([ready])).toEqual([]);
    transitions.clear();
    expect(transitions.sync([ready])).toEqual([]);
    transitions.sync([patient]);
    expect(transitions.sync([{ ...ready, remainingPatienceMs: 0 }])).toEqual([]);
    expect(transitions.sync([{ ...ready, lifecycle: 'lost' }])).toEqual([]);
    expect(transitions.sync([])).toEqual([]);
  });

  it('can identify critical entry and discharge readiness in the same snapshot', () => {
    const transitions = new PatientSoundTransitions();
    transitions.sync([patient]);
    expect(transitions.sync([{ ...patient, completedTreatments: 3, remainingPatienceMs: 22500 }]))
      .toEqual(['critical', 'ready']);
  });
});

describe('soft synthesized patient audio', () => {
  it('starts only after unlock and never queues missed sounds', async () => {
    const { context, audio } = fakeContext();
    expect(audio.play(['critical'])).toBe(false);
    expect(context.createOscillator).not.toHaveBeenCalled();
    context.state = 'suspended';
    expect(await audio.unlock()).toBe(true);
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.createOscillator).not.toHaveBeenCalled();
    expect(context.createGain.mock.results[0]!.value.gain.setValueAtTime).toHaveBeenCalledWith(0.35, 5);
  });

  it('uses short distinct sine patterns with a soft attack and a zero tail', async () => {
    const { context, audio } = fakeContext();
    await audio.unlock();
    expect(audio.play(['ready', 'critical'])).toBe(true);
    const voices = context.createOscillator.mock.results.map(({ value }) => value);
    expect(voices).toHaveLength(5);
    expect(voices.every((voice) => voice.type === 'sine')).toBe(true);
    expect(voices.map((voice) => voice.frequency.setValueAtTime.mock.calls[0]![0]))
      .toEqual([440, 349.23, 523.25, 659.25, 783.99]);
    const gains = context.createGain.mock.results.slice(1).map(({ value }) => value.gain);
    for (const gain of gains) {
      expect(gain.setValueAtTime.mock.calls[0]![0]).toBe(0);
      expect(gain.linearRampToValueAtTime.mock.calls.map((call: [number, number]) => call[0])).toEqual([0.08, 0]);
      expect(gain.exponentialRampToValueAtTime.mock.calls[0]![0]).toBe(0.0001);
    }
    expect(voices[2]!.start.mock.calls[0]![0]).toBeGreaterThan(voices[1]!.stop.mock.calls[0]![0]);
    expect(PATIENT_CUE_NOTES.ready.at(-1)!.frequency).toBeGreaterThan(PATIENT_CUE_NOTES.ready[0].frequency);
  });

  it('bounds bursts with a per-kind cooldown and respects mute, zero volume and hidden-page stop', async () => {
    const { context, audio } = fakeContext();
    await audio.unlock();
    expect(audio.play(['critical', 'critical'])).toBe(true);
    expect(audio.play(['critical'])).toBe(false);
    context.currentTime += 1.25;
    expect(audio.play(['critical'])).toBe(true);
    audio.setMuted(true);
    expect(audio.play(['ready'])).toBe(false);
    expect(context.createOscillator.mock.results[0]!.value.stop).toHaveBeenLastCalledWith(6.28);
    audio.setMuted(false);
    audio.setVolume(0);
    expect(audio.play(['ready'])).toBe(false);
    audio.setVolume(5);
    expect(audio.volume).toBe(1);
    audio.setVolume(NaN);
    expect(audio.volume).toBe(0.35);
    audio.stop();
    expect(context.close).not.toHaveBeenCalled();
  });

  it('releases voices on completion and shutdown without closing the borrowed game context', async () => {
    const { context, audio } = fakeContext();
    await audio.unlock();
    audio.play(['ready']);
    const voice = context.createOscillator.mock.results[0]!.value;
    voice.onended!();
    expect(voice.disconnect).toHaveBeenCalledOnce();
    audio.dispose();
    expect(context.createGain.mock.results[0]!.value.disconnect).toHaveBeenCalledOnce();
    expect(audio.play(['critical'])).toBe(false);
    expect(await audio.unlock()).toBe(false);
    expect(context.close).not.toHaveBeenCalled();
  });

  it('handles unavailable audio and autoplay rejection without errors or stale playback', async () => {
    expect(await new SoftPatientAudio(() => null).unlock()).toBe(false);
    const { context, audio } = fakeContext();
    context.state = 'suspended';
    context.resume.mockRejectedValueOnce(new Error('Autoplay blocked'));
    expect(await audio.unlock()).toBe(false);
    expect(audio.play(['critical'])).toBe(false);
    context.state = 'closed';
    expect(await audio.unlock()).toBe(false);
  });
});
