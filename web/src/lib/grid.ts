/** Bar and beat arithmetic for a song with a known tempo. Times are in seconds. */

/** Beats per bar from a time signature like "4/4", or null when unknown. */
export function beatsPerBar(timeSig: string | null): number | null {
  const m = timeSig?.match(/^\s*(\d+)\s*\/\s*\d+\s*$/);
  const n = m ? Number(m[1]) : 0;
  return n > 0 ? n : null;
}

export function barSeconds(bpm: number, beatsPerBar: number): number {
  return (60 / bpm) * beatsPerBar;
}

/** The nearest bar line to `sec`, never before 0. `firstDownbeat` is where bar 1 starts. */
export function snapToBar(sec: number, bpm: number, beatsPerBar: number, firstDownbeat = 0): number {
  const bar = barSeconds(bpm, beatsPerBar);
  return Math.max(0, firstDownbeat + Math.round((sec - firstDownbeat) / bar) * bar);
}

/** Snap both ends to bar lines: at least one bar long, and ending no later than the song. */
export function snapLoopToBars(
  start: number,
  end: number,
  bpm: number,
  beatsPerBar: number,
  duration: number,
): [number, number] {
  const bar = barSeconds(bpm, beatsPerBar);
  if (duration < bar) return [0, duration];
  let s = snapToBar(start, bpm, beatsPerBar);
  let e = snapToBar(end, bpm, beatsPerBar);
  const lastBar = Math.floor(duration / bar + 1e-9) * bar;
  if (e > lastBar) e = lastBar;
  if (e - s < bar - 1e-9) {
    if (s + bar <= lastBar + 1e-9) e = s + bar;
    else {
      e = lastBar;
      s = e - bar;
    }
  }
  return [Math.max(0, s), e];
}

/** "bars 5–8" (1-based, end bar inclusive) or "bar 5" for a single bar. */
export function barLabel(start: number, end: number, bpm: number, beatsPerBar: number): string {
  const bar = barSeconds(bpm, beatsPerBar);
  const first = Math.round(start / bar) + 1;
  const last = Math.max(first, Math.round(end / bar));
  return first === last ? `bar ${first}` : `bars ${first}–${last}`;
}

export interface GridLine {
  sec: number;
  /** 1-based bar number on a downbeat, otherwise null. */
  bar: number | null;
  /** 1-based beat within the bar. */
  beat: number;
}

/** Every beat line in [startSec, endSec]. */
export function gridLines(startSec: number, endSec: number, bpm: number, beatsPerBar: number): GridLine[] {
  const beat = 60 / bpm;
  const out: GridLine[] = [];
  for (let i = Math.max(0, Math.ceil(startSec / beat - 1e-9)); i * beat <= endSec + 1e-9; i++) {
    const inBar = i % beatsPerBar;
    out.push({ sec: i * beat, bar: inBar === 0 ? i / beatsPerBar + 1 : null, beat: inBar + 1 });
  }
  return out;
}
