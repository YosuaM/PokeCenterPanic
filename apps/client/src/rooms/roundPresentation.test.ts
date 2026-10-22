import { describe, expect, it } from 'vitest';
import { resultsPresentation, roundClock, roundProgressLabel } from './roundPresentation.js';

describe('round presentation', () => {
  it.each([[360000, '6:00'], [359999, '6:00'], [30000, '0:30'], [1, '0:01'], [0, '0:00'], [-1, '0:00']])(
    'displays %s milliseconds as %s', (ms, text) => expect(roundClock(ms as number)).toBe(text));

  it('shows all results, a one-decimal success rate and accessible star text', () => {
    expect(resultsPresentation({ score: 355, admitted: 5, discharged: 3, lost: 1, unfinished: 1, stars: 1,
      bestStreak: 3 })).toEqual({ score: '355 points', patients: '3 discharged · 1 lost · 1 unfinished · 5 admitted',
      success: '60.0% success', stars: '★☆☆ · 1 / 3 stars', streak: 'Best streak: 3 discharges' });
    expect(resultsPresentation({ score: 0, admitted: 0, discharged: 0, lost: 0, unfinished: 0, stars: 0,
      bestStreak: 0 })).toMatchObject({ success: 'N/A success', stars: '☆☆☆ · 0 / 3 stars',
      streak: 'Best streak: 0 discharges' });
    expect(resultsPresentation({ score: 150, admitted: 1, discharged: 1, lost: 0, unfinished: 0, stars: 3,
      bestStreak: 1 }).streak).toBe('Best streak: 1 discharge');
  });

  it.each([[0, '5:00 · SCORE: 40'], [1, '5:00 · SCORE: 40'], [2, '5:00 · SCORE: 40 · STREAK ×2 +10'],
    [6, '5:00 · SCORE: 40 · STREAK ×6 +50'], [9, '5:00 · SCORE: 40 · STREAK ×9 +50']])(
    'labels a streak of %s in the HUD', (streak, label) => {
      expect(roundProgressLabel(300000, 40, streak)).toBe(label);
    });
});
