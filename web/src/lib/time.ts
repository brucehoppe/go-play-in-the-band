/** "m:ss.t" for a time in seconds. Invalid or negative input gives "0:00.0". */
export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const tenths = Math.floor(sec * 10);
  const m = Math.floor(tenths / 600);
  const s = Math.floor((tenths % 600) / 10);
  const t = tenths % 10;
  return `${m}:${String(s).padStart(2, "0")}.${t}`;
}

/** Horizontal position inside an element to a time in the song, clamped to the song. */
export function xToSeconds(x: number, width: number, duration: number): number {
  if (width <= 0) return 0;
  return Math.min(1, Math.max(0, x / width)) * duration;
}
