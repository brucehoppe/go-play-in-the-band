import init, { stretch_mono } from "../wasm/dsp_core.js";

const ready = init();

interface Job {
  id: number;
  channels: Float32Array[];
  speed: number;
  sampleRate: number;
}

self.onmessage = async (e: MessageEvent<Job>) => {
  await ready;
  const { id, channels, speed, sampleRate } = e.data;
  const out = channels.map((c) => stretch_mono(c, speed, sampleRate));
  (self as unknown as Worker).postMessage({ id, channels: out }, out.map((c) => c.buffer));
};
