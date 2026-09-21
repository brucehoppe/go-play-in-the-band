import init, { stretch_mono, stretch_stereo } from "../wasm/dsp_core.js";

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
  // Stereo is stretched as one unit, so left and right share splice points and cannot drift apart.
  let out: Float32Array[];
  if (channels.length === 2) {
    const both = stretch_stereo(channels[0], channels[1], speed, sampleRate);
    const n = both.length / 2;
    out = [both.slice(0, n), both.slice(n)];
  } else {
    out = channels.map((c) => stretch_mono(c, speed, sampleRate));
  }
  (self as unknown as Worker).postMessage({ id, channels: out }, out.map((c) => c.buffer));
};
