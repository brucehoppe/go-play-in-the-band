/** Average all channels into one new mono array. */
export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0].slice();
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i];
  const k = 1 / channels.length;
  for (let i = 0; i < n; i++) out[i] *= k;
  return out;
}

/** Mono mix of several stems (stem -> channels): each stem averaged to mono, then all added. */
export function sumMono(stems: Float32Array[][]): Float32Array {
  if (stems.length === 0) return new Float32Array(0);
  const out = new Float32Array(stems[0][0].length);
  for (const channels of stems) {
    const m = mixToMono(channels);
    for (let i = 0; i < out.length; i++) out[i] += m[i];
  }
  return out;
}
