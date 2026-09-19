export const DEMO_INFO = { name: "Demo: A minor jam", bpm: 100, timeSig: "4/4", key: "A minor" };

const BASS_HZ = [55, 55, 65.41, 49]; // A1 A1 C2 G1, one per bar

/**
 * A simple synthesised drum-and-bass groove, so the demo needs no audio files
 * (and no copyright). Kick on 1 and 3, snare on 2 and 4, eighth-note hats.
 */
export function synthDemo(sampleRate: number, bars = 16): Float32Array[] {
  const beat = 60 / DEMO_INFO.bpm;
  const total = Math.floor(bars * 4 * beat * sampleRate);
  const out = new Float32Array(total);
  let seed = 12345;
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed / 0xffffffff) * 2 - 1;
  };
  for (let i = 0; i < total; i++) {
    const t = i / sampleRate;
    const beatPos = t / beat;
    const beatIdx = Math.floor(beatPos) % 4;
    const bar = Math.floor(beatPos / 4);
    const inBeat = (beatPos % 1) * beat;
    const inEighth = ((beatPos * 2) % 1) * (beat / 2);
    let s = 0;
    if (beatIdx === 0 || beatIdx === 2) {
      const phase = 2 * Math.PI * (50 * inBeat + (80 / 30) * (1 - Math.exp(-30 * inBeat)));
      s += 0.6 * Math.sin(phase) * Math.exp(-inBeat * 8);
    } else {
      s += 0.35 * noise() * Math.exp(-inBeat * 18);
    }
    s += 0.12 * noise() * Math.exp(-inEighth * 90);
    s += 0.3 * Math.sin(2 * Math.PI * BASS_HZ[bar % 4] * t) * Math.exp(-inBeat * 2.5);
    out[i] = s * 0.7;
  }
  return [out, out.slice()];
}
