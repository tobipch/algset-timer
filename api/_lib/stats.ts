// Getrimmter Mittelwert — Spiegelbild von src/helpers/stats.js (dort liegen
// auch die Tests). Der Server rechnet selbst, statt dem Client zu vertrauen.
export const TRIM_FRACTION = 0.1;

export function trimmedMean(values: number[], fraction = TRIM_FRACTION): number | null {
  const nums = (values ?? []).filter((v) => Number.isFinite(v));
  if (nums.length === 0) return null;
  const sorted = nums.slice().sort((a, b) => a - b);
  const k = Math.floor(sorted.length * fraction);
  const kept = k > 0 ? sorted.slice(k, sorted.length - k) : sorted;
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}
