const NOTES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

/** "Am", "C", or null for a chord index from dsp-core (0..11 major, 12..23 minor, else none). */
export function chordName(index: number): string | null {
  if (!Number.isInteger(index) || index < 0 || index > 23) return null;
  return `${NOTES[index % 12]}${index >= 12 ? "m" : ""}`;
}

/** Collapse a per-bar chord list to runs: `[{ bar, name, bars }]`, skipping unknown bars. */
export function chordRuns(indexes: ArrayLike<number>): { bar: number; name: string; bars: number }[] {
  const out: { bar: number; name: string; bars: number }[] = [];
  for (let b = 0; b < indexes.length; b++) {
    const name = chordName(indexes[b]);
    if (!name) continue;
    const last = out[out.length - 1];
    if (last && last.name === name && last.bar + last.bars === b) last.bars++;
    else out.push({ bar: b, name, bars: 1 });
  }
  return out;
}

/** Note name and cents from a frequency, or null for no pitch. */
export function noteFor(hz: number): { name: string; octave: number; cents: number } | null {
  if (!(hz > 0) || !Number.isFinite(hz)) return null;
  const midi = 69 + 12 * Math.log2(hz / 440);
  const nearest = Math.round(midi);
  return { name: NOTES[((nearest % 12) + 12) % 12], octave: Math.floor(nearest / 12) - 1, cents: Math.round((midi - nearest) * 100) };
}
