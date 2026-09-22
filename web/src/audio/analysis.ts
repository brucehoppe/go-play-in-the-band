import { keyName } from "../lib/songtools";

let worker: Worker | null = null;
let nextId = 0;

type Job =
  | { kind: "analyse" | "split" | "pitch"; mono: Float32Array; sampleRate: number }
  | { kind: "chords"; mono: Float32Array; sampleRate: number; bpm: number; downbeat: number; beatsPerBar: number };

function run<T>(job: Job): Promise<T> {
  worker ??= new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" });
  const w = worker;
  const id = nextId++;
  const mono = job.mono.slice();
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<T & { id: number }>) => {
      if (e.data.id !== id) return;
      w.removeEventListener("message", onMessage);
      resolve(e.data);
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", (e) => reject(e.error ?? new Error("Analysis worker failed")), { once: true });
    w.postMessage({ ...job, id, mono }, [mono.buffer]);
  });
}

export interface SongAnalysis {
  /** Estimated tempo, or null. Can be half or double the felt tempo. */
  bpm: number | null;
  /** Seconds to the first detected beat. Which beat is "one" is not known. */
  firstBeat: number;
  key: string | null;
}

/** Tempo, first beat and key, estimated in Rust/WASM off the main thread. */
export async function analyseSong(mono: Float32Array, sampleRate: number): Promise<SongAnalysis> {
  const r = await run<{ bpm: number; firstBeat: number; key: number }>({ kind: "analyse", mono, sampleRate });
  const bpm = r.bpm > 0 ? Math.round(r.bpm * 10) / 10 : null;
  return { bpm, firstBeat: bpm ? r.firstBeat : 0, key: keyName(r.key) };
}

export const QUICK_PARTS = ["Percussive (drums)", "Bass (low)", "Harmonic (guitars, keys, voice)"];

/** Quick split of a mono mix into `QUICK_PARTS`. The parts add back up to the input. */
export async function quickSplit(mono: Float32Array, sampleRate: number): Promise<Float32Array[]> {
  return (await run<{ parts: Float32Array[] }>({ kind: "split", mono, sampleRate })).parts;
}

/** One chord index per bar (see `chordName`), from the song's tempo grid. */
export async function chordsFor(mono: Float32Array, sampleRate: number, bpm: number, downbeat: number, beatsPerBar: number): Promise<Int32Array> {
  return (await run<{ chords: Int32Array }>({ kind: "chords", mono, sampleRate, bpm, downbeat, beatsPerBar })).chords;
}

/** Fundamental of a short window in Hz, or 0. */
export async function pitchOf(window: Float32Array, sampleRate: number): Promise<number> {
  return (await run<{ hz: number }>({ kind: "pitch", mono: window, sampleRate })).hz;
}
