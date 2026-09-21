import init, { peaks } from "../wasm/dsp_core.js";

const ready = init();

self.onmessage = async (e: MessageEvent<{ id: number; mono: Float32Array; buckets: number }>) => {
  await ready;
  const out = peaks(e.data.mono, e.data.buckets);
  (self as unknown as Worker).postMessage({ id: e.data.id, peaks: out }, [out.buffer]);
};
