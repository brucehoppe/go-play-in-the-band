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

/**
 * The two waveform layers: everything except the guitar ("band"), and the guitar on its own.
 * Both are as long as the song even when one side is empty, e.g. a recording that is only guitar.
 */
export function waveLayers(stems: { name: string; channels: Float32Array[] }[], guitarName: string): { band: Float32Array; guitar: Float32Array | null; mono: Float32Array } {
  const length = stems[0]?.channels[0]?.length ?? 0;
  const gi = stems.findIndex((s) => s.name === guitarName);
  const others = stems.filter((_, k) => k !== gi).map((s) => s.channels);
  const band = others.length ? sumMono(others) : new Float32Array(length);
  const guitar = gi >= 0 ? sumMono([stems[gi].channels]) : null;
  const mono = guitar ? band.map((v, k) => v + (guitar[k] ?? 0)) : band;
  return { band, guitar, mono };
}
