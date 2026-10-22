export type HintAction = 'pickup' | 'seat' | 'heal' | 'prepare' | 'medicate' | 'discharge' | 'repair';

export const HINT_TEXT: Readonly<Record<HintAction, string>> = {
  pickup: 'TIP · The patient file lists what this Pokémon still needs',
  seat: 'TIP · Seat a patient to free your hands for medicine',
  heal: 'TIP · Healing runs by itself and pauses the wait — keep moving',
  prepare: 'TIP · Keep holding E and stand still until the dose is ready',
  medicate: 'TIP · Medicine works on seated patients and finished machines',
  discharge: 'TIP · Discharges in a row build a streak bonus; a loss resets it',
  repair: 'TIP · Hold E with empty hands to restore the machine',
};

const PATIENT_TARGET = /^(reception|waiting|recovery|healing)(:|$)/;

/** Classifies an available action by its target and indicator label; rejections return null. */
export function hintActionFor(targetId: string, label: string): HintAction | null {
  if (label === 'Hold E: repair outage') return 'repair';
  if (targetId.startsWith('medicine:prep:') && label.startsWith('Hold E: prepare')) return 'prepare';
  if (targetId.startsWith('medicine:apply:') && label.startsWith('Apply ')) return 'medicate';
  if (targetId === 'discharge' && label === 'Discharge patient') return 'discharge';
  if (label === 'Place in healing machine') return 'heal';
  if (targetId.startsWith('waiting:') && label === 'Place patient') return 'seat';
  if (PATIENT_TARGET.test(targetId) && label.startsWith('Pick up ')) return 'pickup';
  return null;
}

/** Shows each tip until the player first performs its action in this browser session. */
export class ContextualHints {
  private readonly used = new Set<HintAction>();

  text(action: HintAction | null): string {
    return action && !this.used.has(action) ? HINT_TEXT[action] : '';
  }

  markUsed(action: HintAction | null): void {
    if (action) this.used.add(action);
  }
}
