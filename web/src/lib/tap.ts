/** Tap tempo: the tempo implied by a run of taps, from the median gap between the last eight. */
export const TAP_WINDOW = 8;
/** A gap longer than this starts a new run. */
export const TAP_RESET_MS = 2500;

/** Add a tap at `now` (ms) to the run. Returns the taps to keep. */
export function addTap(taps: number[], now: number): number[] {
  const last = taps[taps.length - 1];
  const run = last === undefined || now - last > TAP_RESET_MS ? [] : taps;
  return [...run, now].slice(-TAP_WINDOW);
}

/** BPM from the taps, or null with fewer than two. */
export function tapBpm(taps: number[]): number | null {
  if (taps.length < 2) return null;
  const gaps = taps.slice(1).map((t, i) => t - taps[i]).sort((a, b) => a - b);
  const mid = gaps.length >> 1;
  const gap = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
  const bpm = 60000 / gap;
  return bpm >= 30 && bpm <= 300 ? Math.round(bpm * 10) / 10 : null;
}
