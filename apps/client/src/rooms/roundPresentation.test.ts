import { describe, expect, it } from 'vitest';
import { resultsPresentation, roundClock } from './roundPresentation.js';

describe('round presentation', () => {
  it.each([[360000, '6:00'], [359999, '6:00'], [30000, '0:30'], [1, '0:01'], [0, '0:00'], [-1, '0:00']])(
    'displays %s milliseconds as %s', (ms, text) => expect(roundClock(ms as number)).toBe(text));

  it('shows all results, a one-decimal success rate and accessible star text', () => {
    expect(resultsPresentation({ score: 325, admitted: 5, discharged: 3, lost: 1, unfinished: 1, stars: 1 }))
      .toEqual({ score: '325 points', patients: '3 discharged · 1 lost · 1 unfinished · 5 admitted',
        success: '60.0% success', stars: '★☆☆ · 1 / 3 stars' });
    expect(resultsPresentation({ score: 0, admitted: 0, discharged: 0, lost: 0, unfinished: 0, stars: 0 }))
      .toMatchObject({ success: 'N/A success', stars: '☆☆☆ · 0 / 3 stars' });
  });
});
