/**
 * Cutting a take recorded over a loop into passes. Everything is in frames of the recording,
 * which runs at the playback speed: a loop of L song frames lasts L / speed recorded frames.
 */

export interface Pass {
  /** Frames of the recording that belong to this pass. */
  samples: Float32Array;
  /** True when the pass covers the whole loop. */
  complete: boolean;
  /** Recorded frames in this pass (the rest is silence). */
  recorded: number;
}

/**
 * Split `take` into loop passes. `offset` is how far into the loop the recording started (recorded
 * frames), `loopFrames` is the loop length in recorded frames. Every pass is returned as one full
 * loop long (silence where nothing was recorded), so each one can be placed at the loop start.
 * A trailing partial pass is dropped unless it is the only one.
 */
export function splitPasses(take: Float32Array, offset: number, loopFrames: number): Pass[] {
  const L = Math.max(1, Math.round(loopFrames));
  const off = Math.max(0, Math.min(L - 1, Math.round(offset)));
  if (take.length === 0) return [];
  const out: Pass[] = [];
  // The first pass runs from `off` to the end of the loop; later passes are whole loops.
  let from = 0;
  let at = off;
  while (from < take.length) {
    const room = L - at;
    const n = Math.min(room, take.length - from);
    const samples = new Float32Array(L);
    samples.set(take.subarray(from, from + n), at);
    out.push({ samples, complete: at === 0 && n === L, recorded: n });
    from += n;
    at = 0;
  }
  const complete = out.filter((p) => p.complete);
  if (complete.length > 0) return complete;
  // No complete pass: keep the one with the most playing in it.
  return [out.reduce((best, p) => (p.recorded > best.recorded ? p : best))];
}
