/** Shift a recorded take earlier by the loopback latency so it lines up with the band. */
export function alignTake(take: Float32Array, latencyFrames: number): Float32Array {
  const shift = Math.max(0, Math.min(take.length, Math.round(latencyFrames)));
  return take.slice(shift);
}

/** Headroom applied to a band-plus-take mixdown so a full band and guitar do not clip. */
export const MIX_HEADROOM = 0.7;

/** Mix mono `band` and `take` (both already aligned) into one mono buffer of the longer length, then hard-limit to +-1. */
export function mixTakeWithBand(band: Float32Array, take: Float32Array, takeGain = 1): Float32Array {
  const out = new Float32Array(Math.max(band.length, take.length));
  for (let i = 0; i < out.length; i++) {
    const v = ((band[i] ?? 0) + (take[i] ?? 0) * takeGain) * MIX_HEADROOM;
    out[i] = Math.max(-1, Math.min(1, v));
  }
  return out;
}

/** Encode mono float samples as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(44 + samples.length * 2));
  const v = new DataView(bytes.buffer);
  const tag = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  tag(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  tag(36, "data");
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, s)) * 32767), true));
  return bytes;
}

/** Loopback latency in frames: where the strongest click in `recorded` sits relative to the click played at `clickFrame`. */
export function measureLatency(recorded: Float32Array, clickFrame: number): number {
  let peak = 0;
  let at = 0;
  for (let i = 0; i < recorded.length; i++) {
    const a = Math.abs(recorded[i]);
    if (a > peak) {
      peak = a;
      at = i;
    }
  }
  return peak < 0.05 ? 0 : Math.max(0, at - clickFrame);
}
