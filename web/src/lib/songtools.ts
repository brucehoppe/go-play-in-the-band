const NOTES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

/** Name for the key index from dsp-core: 0..11 major, 12..23 minor, anything else unknown. */
export function keyName(index: number): string | null {
  if (!Number.isInteger(index) || index < 0 || index > 23) return null;
  return `${NOTES[index % 12]} ${index < 12 ? "major" : "minor"}`;
}

/** A usable tempo from typed input, or null. */
export function parseBpm(text: string): number | null {
  const v = Number(text);
  return Number.isFinite(v) && v >= 30 && v <= 300 ? Math.round(v * 10) / 10 : null;
}

/** A click track: a short high tick on each downbeat, a lower one on the other beats. */
export function makeClick(bpm: number, beatsPerBar: number, firstDownbeat: number, length: number, sampleRate: number): Float32Array {
  const out = new Float32Array(length);
  const beat = (60 / bpm) * sampleRate;
  const tick = Math.round(sampleRate * 0.03);
  // Start on the beat at or after 0 that keeps the bar count lined up with `firstDownbeat`.
  const first = Math.ceil((-firstDownbeat * sampleRate) / beat - 1e-9);
  for (let k = first; ; k++) {
    const at = Math.round(firstDownbeat * sampleRate + k * beat);
    if (at >= length) break;
    const down = ((k % beatsPerBar) + beatsPerBar) % beatsPerBar === 0;
    const freq = down ? 1760 : 1175;
    for (let i = 0; i < tick && at + i < length; i++) {
      out[at + i] = Math.sin((2 * Math.PI * freq * i) / sampleRate) * Math.exp((-6 * i) / tick) * (down ? 0.6 : 0.4);
    }
  }
  return out;
}
