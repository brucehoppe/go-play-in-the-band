let worker: Worker | null = null;
let nextId = 0;

/** Overview peaks ([min, max] pairs) computed in Rust/WASM off the main thread. Transfers `mono`. */
export function computePeaks(mono: Float32Array, buckets: number): Promise<Float32Array> {
  worker ??= new Worker(new URL("./peaks.worker.ts", import.meta.url), { type: "module" });
  const w = worker;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<{ id: number; peaks: Float32Array }>) => {
      if (e.data.id !== id) return;
      w.removeEventListener("message", onMessage);
      resolve(e.data.peaks);
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", (e) => reject(e.error ?? new Error("Waveform worker failed")), { once: true });
    w.postMessage({ id, mono, buckets }, [mono.buffer]);
  });
}
