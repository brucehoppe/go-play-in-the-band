import init, { chords, key, pitch, split, tempo } from "../wasm/dsp_core.js";

const ready = init();

export type AnalysisJob =
  | { id: number; kind: "analyse"; mono: Float32Array; sampleRate: number }
  | { id: number; kind: "split"; mono: Float32Array; sampleRate: number }
  | { id: number; kind: "chords"; mono: Float32Array; sampleRate: number; bpm: number; downbeat: number; beatsPerBar: number }
  | { id: number; kind: "pitch"; mono: Float32Array; sampleRate: number };

self.onmessage = async (e: MessageEvent<AnalysisJob>) => {
  await ready;
  const job = e.data;
  const { id, mono, sampleRate } = job;
  const port = self as unknown as Worker;
  if (job.kind === "analyse") {
    const t = tempo(mono, sampleRate);
    port.postMessage({ id, bpm: t[0], firstBeat: t[1], key: key(mono, sampleRate) });
  } else if (job.kind === "chords") {
    const out = chords(mono, sampleRate, job.bpm, job.downbeat, job.beatsPerBar);
    port.postMessage({ id, chords: out }, [out.buffer]);
  } else if (job.kind === "pitch") {
    port.postMessage({ id, hz: pitch(mono, sampleRate) });
  } else {
    const all = split(mono, sampleRate);
    const n = mono.length;
    const parts = [0, 1, 2].map((k) => all.slice(k * n, (k + 1) * n));
    port.postMessage({ id, parts }, parts.map((p) => p.buffer));
  }
};
