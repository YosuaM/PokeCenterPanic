import { patientPatienceRatio, patientPresentation, type PatientRecord } from '@pokecenter/shared';

export type PatientSoundCue = 'critical' | 'ready';
export const PATIENT_CUE_NOTES = {
  critical: [{ frequency: 440, offset: 0, duration: 0.14 },
    { frequency: 349.23, offset: 0.18, duration: 0.21 }],
  ready: [{ frequency: 523.25, offset: 0, duration: 0.18 },
    { frequency: 659.25, offset: 0.14, duration: 0.18 },
    { frequency: 783.99, offset: 0.28, duration: 0.26 }],
} as const;

export class PatientSoundTransitions {
  private observed = new Map<string, { critical: boolean; ready: boolean }>();

  sync(patients: readonly PatientRecord[]): PatientSoundCue[] {
    const next = new Map<string, { critical: boolean; ready: boolean }>();
    const cues = new Set<PatientSoundCue>();
    for (const patient of patients) {
      if (patient.lifecycle !== 'active') continue;
      const presentation = patientPresentation(patient);
      const state = { critical: presentation.hp > 0 && patientPatienceRatio(patient) <= 0.25,
        ready: presentation.readyForDischarge };
      const previous = this.observed.get(patient.id);
      if (previous) {
        if (state.critical && !previous.critical) cues.add('critical');
        if (state.ready && !previous.ready) cues.add('ready');
      }
      next.set(patient.id, state);
    }
    this.observed = next;
    return [...cues];
  }

  clear(): void { this.observed.clear(); }
}

export class SoftPatientAudio {
  muted = false;
  volume = 0.35;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly voices = new Set<{ oscillator: OscillatorNode; gain: GainNode }>();
  private readonly lastPlayed = new Map<PatientSoundCue, number>();
  private nextAvailableAt = 0;
  private disposed = false;

  constructor(private readonly getContext: () => AudioContext | null) {}

  async unlock(): Promise<boolean> {
    if (this.disposed || this.muted) return false;
    try {
      this.context ??= this.getContext();
      if (!this.context || this.context.state === 'closed') return false;
      if (this.context.state !== 'running') await this.context.resume();
      if (this.disposed || this.context.state !== 'running') return false;
      if (!this.master) {
        this.master = this.context.createGain();
        this.master.gain.setValueAtTime(this.muted ? 0 : this.volume, this.context.currentTime);
        this.master.connect(this.context.destination);
      }
      return true;
    } catch {
      return false;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.updateVolume();
    if (muted) this.stop();
  }

  setVolume(volume: number): void {
    this.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.35;
    this.updateVolume();
    if (!this.volume) this.stop();
  }

  play(cues: readonly PatientSoundCue[]): boolean {
    const context = this.context;
    if (this.disposed || this.muted || !this.volume || !this.master || context?.state !== 'running') return false;
    let played = false;
    for (const cue of ['critical', 'ready'] as const) {
      if (!cues.includes(cue) || context.currentTime - (this.lastPlayed.get(cue) ?? -Infinity) < 1.25) continue;
      const start = Math.max(context.currentTime + 0.01, this.nextAvailableAt);
      for (const note of PATIENT_CUE_NOTES[cue]) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(note.frequency, start + note.offset);
        oscillator.connect(gain);
        gain.connect(this.master);
        const at = start + note.offset;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.08, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + note.duration);
        gain.gain.linearRampToValueAtTime(0, at + note.duration + 0.03);
        const voice = { oscillator, gain };
        this.voices.add(voice);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
          this.voices.delete(voice);
        };
        oscillator.start(at);
        oscillator.stop(at + note.duration + 0.04);
      }
      const last = PATIENT_CUE_NOTES[cue].at(-1)!;
      this.nextAvailableAt = start + last.offset + last.duration + 0.09;
      this.lastPlayed.set(cue, context.currentTime);
      played = true;
    }
    return played;
  }

  stop(): void {
    const now = this.context?.currentTime ?? 0;
    for (const { oscillator, gain } of this.voices) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, 0.008);
      oscillator.stop(now + 0.03);
    }
    this.lastPlayed.clear();
    this.nextAvailableAt = 0;
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    for (const { oscillator, gain } of this.voices) {
      oscillator.disconnect();
      gain.disconnect();
    }
    this.voices.clear();
    this.master?.disconnect();
    this.master = null;
  }

  private updateVolume(): void {
    this.master?.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.context?.currentTime ?? 0, 0.015);
  }
}
