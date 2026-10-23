import type { HudState } from './hudState.js';
import { MACHINE_SIDE } from './hudModel.js';

export const FEED_ENTRY_MS = 4_000;
export const SCORE_POPUP_MS = 1_600;
const FEED_LIMIT = 3;

export interface FeedEntry { id: number; text: string; tone: 'alert' | 'good' | 'ready'; at: number }
export interface ScorePopup { id: number; points: number; streak: number; at: number }

interface Snapshot {
  machines: string[];
  discharged: number;
  lost: number;
  score: number;
  notice: string;
  settled: Set<string>;
}

/** Turns synchronized state transitions into short event toasts and floating score numbers. */
export class HudFeed {
  private previous: Snapshot | null = null;
  private feed: FeedEntry[] = [];
  private scores: ScorePopup[] = [];
  private nextId = 1;

  sync(state: HudState, timeMs: number): void {
    if (!state.active) {
      this.clear();
      return;
    }
    const settled = new Set(state.patients.filter((patient) => patient.lifecycle !== 'active')
      .map((patient) => patient.id));
    const current: Snapshot = { machines: state.machines.map((machine) => machine.status),
      discharged: state.discharged, lost: state.lost, score: state.score, notice: state.notice, settled };
    const previous = this.previous;
    this.previous = current;
    if (!previous) return;
    current.machines.forEach((status, index) => {
      const before = previous.machines[index];
      const side = MACHINE_SIDE[index] ?? 'A';
      if (status === 'broken' && before && before !== 'broken') this.push(`${side} machine broke down`, 'alert', timeMs);
      if (status !== 'broken' && before === 'broken') this.push(`${side} machine is back online`, 'good', timeMs);
    });
    const newly = (lifecycle: string) => state.patients.filter((patient) => patient.lifecycle === lifecycle &&
      !previous.settled.has(patient.id)).map((patient) => patient.species);
    const points = state.score - previous.score;
    // Scores and discharge counts can arrive in separate updates, so each produces its own cue.
    if (points > 0) this.scores.push({ id: this.nextId++, points, streak: state.streak, at: timeMs });
    if (state.discharged > previous.discharged) {
      const names = newly('discharged');
      this.push(names.length === 1 ? `${names[0]} discharged` : `${state.discharged - previous.discharged} discharged`,
        'good', timeMs);
    }
    if (state.lost > previous.lost) {
      const names = newly('lost');
      this.push(names.length === 1 ? `${names[0]} gave up waiting` : `${state.lost - previous.lost} patients left`,
        'alert', timeMs);
    }
    if (state.notice && state.notice !== previous.notice) this.push(state.notice, 'ready', timeMs);
  }

  entries(timeMs: number): FeedEntry[] {
    this.feed = this.feed.filter((entry) => timeMs - entry.at < FEED_ENTRY_MS);
    return this.feed;
  }

  popups(timeMs: number): ScorePopup[] {
    this.scores = this.scores.filter((popup) => timeMs - popup.at < SCORE_POPUP_MS);
    return this.scores;
  }

  clear(): void {
    this.previous = null;
    this.feed = [];
    this.scores = [];
  }

  private push(text: string, tone: FeedEntry['tone'], at: number): void {
    this.feed = [...this.feed, { id: this.nextId++, text, tone, at }].slice(-FEED_LIMIT);
  }
}
