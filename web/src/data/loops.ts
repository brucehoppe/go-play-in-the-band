/** Saved loops per song: a name and a range in seconds. */
import type { LoopRange } from "../lib/loop";
import { dbGet, dbPut } from "./db";

export interface SavedLoop extends LoopRange {
  name: string;
}

/** A stored list, checked entry by entry. Anything odd is dropped. */
export function parseLoops(v: unknown): SavedLoop[] {
  if (!Array.isArray(v)) return [];
  const out: SavedLoop[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const { name, start, end } = x as Record<string, unknown>;
    if (typeof name !== "string" || name.length === 0 || name.length > 40) continue;
    if (typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (start < 0 || end <= start) continue;
    out.push({ name, start, end });
  }
  return out.slice(0, 50);
}

export async function loadLoops(song: string): Promise<SavedLoop[]> {
  return parseLoops(await dbGet("loops", song));
}

export async function saveLoops(song: string, loops: SavedLoop[]): Promise<boolean> {
  return dbPut("loops", song, parseLoops(loops));
}

/** Add or replace a loop by name. */
export function upsertLoop(loops: SavedLoop[], loop: SavedLoop): SavedLoop[] {
  const rest = loops.filter((l) => l.name !== loop.name);
  return [...rest, loop].sort((a, b) => a.start - b.start);
}
