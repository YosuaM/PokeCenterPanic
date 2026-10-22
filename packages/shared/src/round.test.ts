import { describe, expect, it } from 'vitest';
import { arrivalDifficulty, dischargePoints, roundResults, streakBonus } from './round.js';

describe('round scoring', () => {
  it.each([[72000, 140], [45000, 125], [18000, 110], [1, 100], [90000, 150],
    [100000, 150], [-1, 100], [NaN, 100]])('awards %s patience as %s points', (remainingPatienceMs, points) => {
    expect(dischargePoints({ initialPatienceMs: 90000, remainingPatienceMs })).toBe(points);
  });

  it('handles invalid budgets without awarding a patience bonus', () => {
    expect(dischargePoints({ initialPatienceMs: 0, remainingPatienceMs: 100 })).toBe(100);
  });

  it('reproduces the five-patient example and permits negative scores', () => {
    expect(roundResults(355, 5, 3, 1, 3)).toEqual({ score: 355, admitted: 5,
      discharged: 3, lost: 1, unfinished: 1, stars: 1, bestStreak: 3 });
    expect(roundResults(325, 5, 3, 1).bestStreak).toBe(0);
    expect(roundResults(-100, 2, 0, 2)).toMatchObject({ score: -100, unfinished: 0, stars: 0 });
    expect(roundResults(0, 0, 0, 0)).toMatchObject({ unfinished: 0, stars: 0 });
  });

  it.each([[499, 1000, 0], [500, 1000, 1], [699, 1000, 1], [700, 1000, 2],
    [899, 1000, 2], [900, 1000, 3], [1, 1, 3], [9999, 20000, 0]])(
    'uses the unrounded ratio %s/%s for %s stars', (discharged, admitted, stars) => {
      expect(roundResults(0, admitted, discharged, 0).stars).toBe(stars);
    });

  it.each([[0, 0], [1, 0], [2, 10], [3, 20], [6, 50], [7, 50], [100, 50], [-2, 0], [2.5, 0], [NaN, 0]])(
    'awards a streak of %s a %s point bonus', (streak, bonus) => {
      expect(streakBonus(streak)).toBe(bonus);
    });

  it.each([[0, 0.1, 90000], [119999, 0.1, 90000], [120000, 0.25, 80000], [239999, 0.25, 80000],
    [240000, 0.4, 70000], [329999, 0.4, 70000], [999999, 0.4, 70000], [-5, 0.1, 90000], [NaN, 0.1, 90000]])(
    'schedules arrivals at %s ms with %s two-treatment chance and %s ms patience',
    (elapsedMs, twoTreatmentChance, patienceMs) => {
      expect(arrivalDifficulty(elapsedMs)).toEqual({ twoTreatmentChance, patienceMs });
    });
});
