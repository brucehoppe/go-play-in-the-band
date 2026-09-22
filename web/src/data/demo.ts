import type { Section, Stem } from "../types";

/** A synthesised demo song: a 4-bar form repeated over `bars` bars. */
export interface DemoSong {
  name: string;
  bpm: number;
  timeSig: string;
  key: string;
  beatsPerBar: number;
  /** Bass note per bar of the form, Hz. */
  bass: number[];
  /** Guitar notes, one per eighth note over two bars of the form; 0 is a rest. */
  riff: number[];
  /** Chord tones per bar of the form. */
  chords: number[][];
  bars: number;
}

const A3 = 220;
const C4 = 261.63;
const D4 = 293.66;
const E4 = 329.63;
const G4 = 392;
const A4 = 440;
const B3 = 246.94;
const E3 = 164.81;
const Gs3 = 207.65;
const Fs4 = 369.99;
const Gs4 = 415.3;
const B4 = 493.88;
const Cs5 = 554.37;

export const DEMO_SONGS: DemoSong[] = [
  {
    name: "Demo: A minor jam",
    bpm: 100,
    timeSig: "4/4",
    key: "A minor",
    beatsPerBar: 4,
    bass: [55, 55, 65.41, 49], // A1 A1 C2 G1
    // Two bars of eighth notes of A minor pentatonic.
    riff: [A3, 0, C4, D4, E4, 0, D4, C4, A3, 0, C4, E4, G4, E4, D4, 0, A4, G4, E4, 0, D4, C4, A3, 0, E4, 0, G4, E4, D4, C4, D4, A3],
    chords: [
      [A3, C4, E4],
      [A3, C4, E4],
      [C4, E4, G4],
      [B3, D4, G4],
    ],
    bars: 16,
  },
  {
    name: "Demo: E waltz",
    bpm: 90,
    timeSig: "3/4",
    key: "E major",
    beatsPerBar: 3,
    bass: [41.2, 55, 61.74, 41.2], // E1 A1 B1 E1: E A B E
    // Two bars of 3/4 = 12 eighth notes, E major.
    riff: [E4, 0, Gs4, B4, Gs4, E4, Fs4, 0, A4, Cs5, B4, A4],
    chords: [
      [E3, Gs3, B3],
      [A3, 277.18, E4],
      [B3, 311.13, Fs4],
      [E3, Gs3, B3],
    ],
    bars: 16,
  },
];

export const DEMO_INFO = DEMO_SONGS[0];

/** Four sections of a demo, each a quarter of its bars. */
export function demoSections(song: DemoSong): Section[] {
  const bar = (60 / song.bpm) * song.beatsPerBar;
  const per = song.bars / 4;
  return ["Intro", "Verse", "Chorus", "Solo"].map((name, i) => ({ name, start: i * per * bar, end: (i + 1) * per * bar }));
}

export const DEMO_SECTIONS: Section[] = demoSections(DEMO_INFO);

/** The stem that stands for the original guitar part. */
export const GUITAR_STEM = "guitar";

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
export function synthDemoStems(sampleRate: number, bars = 16, song: DemoSong = DEMO_INFO): Stem[] {
  const beat = 60 / song.bpm;
  const bpb = song.beatsPerBar;
  const barLen = beat * bpb;
  const total = Math.floor(bars * barLen * sampleRate);
  const { bass: BASS_HZ, riff: RIFF, chords: CHORDS } = song;
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
    const beatIdx = Math.floor(beatPos) % bpb;
    const bar = Math.floor(beatPos / bpb);
    const inBeat = (beatPos % 1) * beat;
    const inEighth = ((beatPos * 2) % 1) * (beat / 2);
    const inSixteenth = ((beatPos * 4) % 1) * (beat / 4);
    const inBar = (beatPos % bpb) * beat;

    let d = 0;
    // Kick on 1 (and 3 in 4/4), snare on the other beats.
    if (beatIdx === 0 || (bpb === 4 && beatIdx === 2)) {
      const phase = 2 * Math.PI * (50 * inBeat + (80 / 30) * (1 - Math.exp(-30 * inBeat)));
      d += 0.6 * Math.sin(phase) * Math.exp(-inBeat * 8);
    } else {
      d += 0.35 * drumNoise() * Math.exp(-inBeat * 18);
    }
    d += 0.12 * drumNoise() * Math.exp(-inEighth * 90);
    drums[i] = d;

    bass[i] = 0.3 * Math.sin(2 * Math.PI * BASS_HZ[bar % BASS_HZ.length] * t) * Math.exp(-inBeat * 2.5);

    // Guitar: a plucked note per eighth, a few decaying harmonics.
    const hz = RIFF[((Math.floor(beatPos * 2) % RIFF.length) + RIFF.length) % RIFF.length];
    if (hz > 0) {
      let g = 0;
      for (let h = 1; h <= 4; h++) g += (Math.sin(2 * Math.PI * hz * h * t) / h) * Math.exp(-inEighth * (7 + 4 * h));
      guitar[i] = 0.32 * g * Math.min(1, inEighth * 600);
    }

    // Keys: a soft pad that swells in and out of each bar.
    const env = Math.min(1, inBar / 0.25) * Math.min(1, (barLen - inBar) / 0.12);
    let k = 0;
    for (const f of CHORDS[bar % CHORDS.length]) k += Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * 2 * f * t);
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
export function synthDemo(sampleRate: number, bars = 16, song: DemoSong = DEMO_INFO): Float32Array[] {
  const stems = synthDemoStems(sampleRate, bars, song);
  const out = new Float32Array(stems[0].channels[0].length);
  for (const s of stems) for (let i = 0; i < out.length; i++) out[i] += s.channels[0][i];
  return [out, out.slice()];
}
