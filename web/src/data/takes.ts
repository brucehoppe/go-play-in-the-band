/** Recorded takes, kept in IndexedDB so they survive a reload. Every call fails soft. */
import { dbDelete, dbGet, dbPut } from "./db";

const key = (song: string, n: number) => `take:${song}:${n}`;
const MAX_TAKES = 32;

export async function saveTake(k: string, samples: Float32Array): Promise<boolean> {
  return dbPut("takes", k, samples);
}

/** Returns the stored take, or null if missing or not a Float32Array. */
export async function loadTake(k: string): Promise<Float32Array | null> {
  const v = await dbGet("takes", k);
  return v instanceof Float32Array ? v : null;
}

/** Every stored take for a song, in order. Stops at the first gap. */
export async function loadTakes(song: string): Promise<Float32Array[]> {
  const out: Float32Array[] = [];
  for (let i = 1; i <= MAX_TAKES; i++) {
    const t = await loadTake(key(song, i));
    if (!t) break;
    out.push(t);
  }
  return out;
}

/** Remove take `n` (1-based) and shift the later ones down, so the stored takes stay 1..k. */
export async function deleteTake(song: string, n: number): Promise<void> {
  const all = await loadTakes(song);
  if (n < 1 || n > all.length) return;
  for (let i = n; i < all.length; i++) await saveTake(key(song, i), all[i]);
  await dbDelete("takes", key(song, all.length));
}

/** Replace every stored take for a song with `takes` (used when loading a project file). */
export async function replaceTakes(song: string, takes: Float32Array[]): Promise<void> {
  const old = await loadTakes(song);
  for (let i = 0; i < takes.length; i++) await saveTake(key(song, i + 1), takes[i]);
  for (let i = takes.length + 1; i <= old.length; i++) await dbDelete("takes", key(song, i));
}
