export function patientDistress(ratio: number, timeMs: number, faintProgress?: number) {
  if (faintProgress !== undefined) {
    const progress = Math.min(1, Math.max(0, faintProgress));
    return { tint: 0xb3b7c4, roll: -Math.PI / 2 * Math.min(1, progress / 0.35),
      opacity: 1 - Math.max(0, (progress - 0.4) / 0.6), drop: 0.18 * progress };
  }
  const critical = ratio <= 0.25;
  return { tint: critical ? 0xffa3a3 : ratio <= 0.5 ? 0xffd79c : 0xffffff,
    roll: critical ? Math.sin(timeMs / 260) * 0.045 : 0,
    opacity: 1, drop: critical ? 0.06 : 0 };
}
