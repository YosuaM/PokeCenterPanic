import type { RoundResults } from '@pokecenter/shared';

export function roundClock(remainingMs: number): string {
  const seconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function resultsPresentation(results: RoundResults): {
  score: string; patients: string; success: string; stars: string; streak: string;
} {
  return {
    score: `${results.score} points`,
    patients: `${results.discharged} discharged · ${results.lost} lost · ${results.unfinished} unfinished · ${results.admitted} admitted`,
    success: results.admitted ? `${(100 * results.discharged / results.admitted).toFixed(1)}% success` : 'N/A success',
    stars: `${'★'.repeat(results.stars)}${'☆'.repeat(3 - results.stars)} · ${results.stars} / 3 stars`,
    streak: `Best streak: ${results.bestStreak} discharge${results.bestStreak === 1 ? '' : 's'}`,
  };
}
