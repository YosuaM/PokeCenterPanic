import type { HealingMachineSnapshot, MedicineDoseRecord, PatientRecord, PlayerPosition,
  PlayerPresence, Point } from '@pokecenter/shared';
import type { SpriteManifest } from '../../sprites/pmd.js';

/** The E/Q prompt the scene resolved for the local player this frame. */
export interface HudAction {
  key: 'E' | 'Q' | null;
  label: string;
  /** `blocked` explains why the selected station cannot be used right now. */
  tone: 'idle' | 'ready' | 'blocked' | 'hold' | 'rejected';
  /** Progress of the action the player is holding, from 0 to 1. */
  progress: number;
  /** Ability that also applies to the focused patient, advertised beside the main action. */
  ability: string;
}

/** Everything the in-game HUD shows, published by the scene whenever gameplay state changes. */
export interface HudState {
  active: boolean;
  localId: string;
  players: readonly PlayerPresence[];
  positions: readonly PlayerPosition[];
  patients: readonly PatientRecord[];
  machines: readonly HealingMachineSnapshot[];
  doses: readonly MedicineDoseRecord[];
  medicineOwners: readonly string[];
  medicineRemainingMs: readonly number[];
  remainingMs: number;
  score: number;
  streak: number;
  discharged: number;
  lost: number;
  focusedPatientId: string;
  action: HudAction;
  tip: string;
  /** Short-lived "ready for discharge" notice, already grouped by the scene. */
  notice: string;
  manifest: SpriteManifest | null;
}

/** Logical 960 × 540 screen points of the world elements the HUD labels. */
export interface HudAnchors {
  players: ReadonlyMap<string, Point>;
  patients: ReadonlyMap<string, Point>;
  machines: readonly Point[];
  preparation: readonly Point[];
  discharge: Point;
}

export interface HudSink {
  render(state: HudState, timeMs: number): void;
  place(anchors: HudAnchors, timeMs: number): void;
  destroy(): void;
}

export const IDLE_ACTION: HudAction = { key: null, label: 'Approach a station or patient', tone: 'idle',
  progress: 0, ability: '' };
