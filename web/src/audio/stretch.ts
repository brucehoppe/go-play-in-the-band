let worker: Worker | null = null;
let nextId = 0;

/** Time-stretch every channel of a stem in Rust/WASM off the main thread. Speed 0.75 plays 25% slower, same pitch. Does not consume `channels`. */
export function stretchChannels(channels: Float32Array[], speed: number, sampleRate: number): Promise<Float32Array[]> {
  if (speed === 1) return Promise.resolve(channels.map((c) => c.slice()));
  worker ??= new Worker(new URL("./stretch.worker.ts", import.meta.url), { type: "module" });
  const w = worker;
  const id = nextId++;
  const copies = channels.map((c) => c.slice());
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<{ id: number; channels: Float32Array[] }>) => {
      if (e.data.id !== id) return;
      w.removeEventListener("message", onMessage);
      resolve(e.data.channels);
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", (e) => reject(e.error ?? new Error("Stretch worker failed")), { once: true });
    w.postMessage({ id, channels: copies, speed, sampleRate }, copies.map((c) => c.buffer));
  });
}
