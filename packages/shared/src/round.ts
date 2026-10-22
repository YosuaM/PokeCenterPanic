export interface RoundResults {
  score: number;
  admitted: number;
  discharged: number;
  lost: number;
  unfinished: number;
  stars: number;
}

export interface RoundProgressSnapshot {
  remainingMs: number;
  score: number;
  results: RoundResults | null;
}
