/** Songs you have opened, so they can be reopened after a reload. Files are kept up to a size limit. */
import { dbAll, dbDelete, dbPut } from "./db";

export const MAX_STORED_FILE = 64 * 1024 * 1024;

export interface SongEntry {
  name: string;
  /** When it was last opened, ms since the epoch. */
  when: number;
  kind: "file" | "recording" | "demo";
  /** The file itself, for `kind: "file"` when it fit under the limit. */
  blob?: Blob;
}

export function parseSong(key: string, v: unknown): SongEntry | null {
  if (!v || typeof v !== "object") return null;
  const { name, when, kind, blob } = v as Record<string, unknown>;
  if (typeof name !== "string" || name !== key || name.length === 0 || name.length > 200) return null;
  if (typeof when !== "number" || !Number.isFinite(when)) return null;
  if (kind !== "file" && kind !== "recording" && kind !== "demo") return null;
  const entry: SongEntry = { name, when, kind };
  if (kind === "file" && typeof Blob !== "undefined" && blob instanceof Blob) entry.blob = blob;
  if (kind === "file" && !entry.blob) return null;
  return entry;
}

export async function rememberSong(entry: SongEntry): Promise<boolean> {
  if (entry.kind === "file" && (!entry.blob || entry.blob.size > MAX_STORED_FILE)) return false;
  return dbPut("songs", entry.name, entry);
}

/** Newest first. */
export async function listSongs(): Promise<SongEntry[]> {
  const rows = await dbAll("songs");
  return rows
    .map((r) => parseSong(r.key, r.value))
    .filter((s): s is SongEntry => s !== null)
    .sort((a, b) => b.when - a.when);
}

export async function forgetSong(name: string): Promise<boolean> {
  return dbDelete("songs", name);
}
