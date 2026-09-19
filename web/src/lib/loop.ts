import { barLabel, barSeconds } from "./grid";
import { formatTime } from "./time";

export interface LoopRange {
  start: number;
  end: number;
}

/** Shortest loop the editor allows, in seconds. */
export const MIN_LOOP = 0.1;

/** Put the IN handle at `pos`. With no loop yet, or a loop that would end before it, a default length is made. */
export function setIn(loop: LoopRange | null, pos: number, duration: number, defaultLen = 4): LoopRange {
  const start = Math.max(0, Math.min(pos, duration - MIN_LOOP));
  const keep = loop && loop.end >= start + MIN_LOOP ? loop.end : Math.min(duration, start + defaultLen);
  return { start, end: Math.max(keep, start + MIN_LOOP) };
}

/** Put the OUT handle at `pos`, mirroring `setIn`. */
export function setOut(loop: LoopRange | null, pos: number, duration: number, defaultLen = 4): LoopRange {
  const end = Math.min(duration, Math.max(pos, MIN_LOOP));
  const keep = loop && loop.start <= end - MIN_LOOP ? loop.start : Math.max(0, end - defaultLen);
  return { start: Math.min(keep, end - MIN_LOOP), end };
}

/** Move one handle to `sec`, clamped to the song and at least MIN_LOOP from the other handle. */
export function moveHandle(loop: LoopRange, which: "in" | "out", sec: number, duration: number): LoopRange {
  if (which === "in") return { start: Math.max(0, Math.min(sec, loop.end - MIN_LOOP)), end: loop.end };
  return { start: loop.start, end: Math.min(duration, Math.max(sec, loop.start + MIN_LOOP)) };
}

/** True when both ends sit on bar lines (within 20 ms). */
export function isOnBars(loop: LoopRange, bpm: number, bpb: number): boolean {
  const bar = barSeconds(bpm, bpb);
  const on = (t: number) => Math.abs(t - Math.round(t / bar) * bar) < 0.02;
  return on(loop.start) && on(loop.end);
}

/** "Loop, bars 5–8" when on bar lines with a known tempo, else "Loop, m:ss.t to m:ss.t". */
export function loopName(loop: LoopRange, bpm: number | null, bpb: number | null): string {
  if (bpm && bpb && isOnBars(loop, bpm, bpb)) return `Loop, ${barLabel(loop.start, loop.end, bpm, bpb)}`;
  return `Loop, ${formatTime(loop.start)} to ${formatTime(loop.end)}`;
}
