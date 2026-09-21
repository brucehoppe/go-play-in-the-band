import type { Section, Stem } from "../types";

export const DEMO_INFO = { name: "Demo: A minor jam", bpm: 100, timeSig: "4/4", key: "A minor" };

const DEMO_BAR = (60 / 100) * 4;

/** Four 4-bar sections of the 16-bar demo. */
export const DEMO_SECTIONS: Section[] = ["Intro", "Verse", "Chorus", "Solo"].map((name, i) => ({
  name,
  start: i * 4 * DEMO_BAR,
  end: (i + 1) * 4 * DEMO_BAR,
}));

/** The stem that stands for the original guitar part. */
export const GUITAR_STEM = "guitar";

const BASS_HZ = [55, 55, 65.41, 49]; // A1 A1 C2 G1, one per bar
const A3 = 220;
const C4 = 261.63;
const D4 = 293.66;
const E4 = 329.63;
const G4 = 392;
const A4 = 440;
/** Two bars of eighth notes of A minor pentatonic; 0 is a rest. The 4-bar form repeats it against the bass. */
const RIFF = [A3, 0, C4, D4, E4, 0, D4, C4, A3, 0, C4, E4, G4, E4, D4, 0, A4, G4, E4, 0, D4, C4, A3, 0, E4, 0, G4, E4, D4, C4, D4, A3];
/** Chord tones per bar of the 4-bar form: Am, Am, C, G. */
const CHORDS = [
  [A3, C4, E4],
  [A3, C4, E4],
  [C4, E4, G4],
  [246.94, D4, G4],
];

function lcg(seed: number): () => number {
  let x = seed;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return (x / 0xffffffff) * 2 - 1;
  };
}

/**
 * A synthesised five-part band, so the demo needs no audio files (and no copyright).
 * The stems are mono, deterministic, and scaled together so their sum never exceeds
 * peak 1. Drums: kick on 1 and 3, snare on 2 and 4, eighth-note hats.
 */
export function synthDemoStems(sampleRate: number, bars = 16): Stem[] {
  const beat = 60 / DEMO_INFO.bpm;
  const barLen = beat * 4;
  const total = Math.floor(bars * barLen * sampleRate);
  const guitar = new Float32Array(total);
  const bass = new Float32Array(total);
  const drums = new Float32Array(total);
  const keys = new Float32Array(total);
  const other = new Float32Array(total);
  const drumNoise = lcg(12345);
  const shakeNoise = lcg(777);
  let shakePrev = 0;
  for (let i = 0; i < total; i++) {
    const t = i / sampleRate;
    const beatPos = t / beat;
    const beatIdx = Math.floor(beatPos) % 4;
    const bar = Math.floor(beatPos / 4);
    const inBeat = (beatPos % 1) * beat;
    const inEighth = ((beatPos * 2) % 1) * (beat / 2);
    const inSixteenth = ((beatPos * 4) % 1) * (beat / 4);
    const inBar = (beatPos % 4) * beat;

    let d = 0;
    if (beatIdx === 0 || beatIdx === 2) {
      const phase = 2 * Math.PI * (50 * inBeat + (80 / 30) * (1 - Math.exp(-30 * inBeat)));
      d += 0.6 * Math.sin(phase) * Math.exp(-inBeat * 8);
    } else {
      d += 0.35 * drumNoise() * Math.exp(-inBeat * 18);
    }
    d += 0.12 * drumNoise() * Math.exp(-inEighth * 90);
    drums[i] = d;

    bass[i] = 0.3 * Math.sin(2 * Math.PI * BASS_HZ[bar % 4] * t) * Math.exp(-inBeat * 2.5);

    // Guitar: a plucked note per eighth, a few decaying harmonics.
    const hz = RIFF[(Math.floor(beatPos * 2) % 32 + 32) % 32];
    if (hz > 0) {
      let g = 0;
      for (let h = 1; h <= 4; h++) g += (Math.sin(2 * Math.PI * hz * h * t) / h) * Math.exp(-inEighth * (7 + 4 * h));
      guitar[i] = 0.32 * g * Math.min(1, inEighth * 600);
    }

    // Keys: a soft pad that swells in and out of each bar.
    const env = Math.min(1, inBar / 0.25) * Math.min(1, (barLen - inBar) / 0.12);
    let k = 0;
    for (const f of CHORDS[bar % 4]) k += Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * 2 * f * t);
    keys[i] = 0.07 * k * env;

    // Other: a shaker on the sixteenths (high-passed noise), louder on the off-beats.
    const n = shakeNoise();
    const hp = n - shakePrev;
    shakePrev = n;
    other[i] = 0.16 * hp * Math.exp(-inSixteenth * 60) * (Math.floor(beatPos * 4) % 2 === 1 ? 1 : 0.6);
  }
  const parts: Stem[] = [
    { name: GUITAR_STEM, channels: [guitar] },
    { name: "bass", channels: [bass] },
    { name: "drums", channels: [drums] },
    { name: "keys", channels: [keys] },
    { name: "other", channels: [other] },
  ];
  // One scale for all stems keeps their balance and guarantees the sum stays inside +-1.
  let peak = 0;
  for (let i = 0; i < total; i++) {
    peak = Math.max(peak, Math.abs(guitar[i] + bass[i] + drums[i] + keys[i] + other[i]));
  }
  const scale = peak > 0.9 ? 0.9 / peak : 1;
  if (scale !== 1) for (const p of parts) for (let i = 0; i < total; i++) p.channels[0][i] *= scale;
  return parts;
}

/** The whole demo band as one stereo mix. */
export function synthDemo(sampleRate: number, bars = 16): Float32Array[] {
  const stems = synthDemoStems(sampleRate, bars);
  const out = new Float32Array(stems[0].channels[0].length);
  for (const s of stems) for (let i = 0; i < out.length; i++) out[i] += s.channels[0][i];
  return [out, out.slice()];
}
