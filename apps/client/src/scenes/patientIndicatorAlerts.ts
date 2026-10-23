import { patientPresentation, type PatientRecord } from '@pokecenter/shared';

export class PatientReadyAlerts {
  private observed = new Map<string, boolean>();
  private notice: { patients: PatientRecord[]; startedAt: number } | null = null;

  sync(patients: readonly PatientRecord[], timeMs: number): void {
    const next = new Map<string, boolean>();
    const becameReady: PatientRecord[] = [];
    for (const patient of patients) {
      if (patient.lifecycle !== 'active') continue;
      const ready = patientPresentation(patient).readyForDischarge;
      if (ready && this.observed.get(patient.id) === false) becameReady.push(patient);
      next.set(patient.id, ready);
    }
    this.observed = next;
    if (this.notice) {
      this.notice.patients = this.notice.patients.map((entry) =>
        patients.find((patient) => patient.id === entry.id))
        .filter((patient): patient is PatientRecord => Boolean(patient && next.get(patient.id)));
      if (!this.notice.patients.length) this.notice = null;
    }
    if (becameReady.length) {
      const existing = this.notice && timeMs - this.notice.startedAt < 3200 ? this.notice.patients : [];
      this.notice = { patients: [...existing, ...becameReady], startedAt: timeMs };
    }
  }

  at(timeMs: number, reducedMotion = false): { text: string; alpha: number } | null {
    if (!this.notice) return null;
    const elapsed = Math.max(0, timeMs - this.notice.startedAt);
    if (elapsed >= 3200) return null;
    return {
      text: this.notice.patients.length === 1 ?
        `${this.notice.patients[0]!.species}${this.notice.patients[0]!.location === 'waiting' ?
          ` #${this.notice.patients[0]!.slotIndex + 1}` : ''} is ready for discharge` :
        `${this.notice.patients.length} Pokémon ready for discharge`,
      alpha: reducedMotion ? 1 : Math.min(1, (3200 - elapsed) / 800),
    };
  }

  clear(): void {
    this.observed.clear();
    this.notice = null;
  }
}
