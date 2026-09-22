/**
 * A project file: one zip with `project.json`, the original recording (when there was a file)
 * and every take as 16-bit WAV. Stems are not stored; they are split again on open.
 */
import { decodeWav, encodeWav } from "../audio/take";
import { bytesText, readZip, textBytes, writeZip } from "../lib/zip";
import { parseLoops } from "./loops";
import type { SavedLoop } from "./loops";

export interface ProjectMeta {
  version: 1;
  name: string;
  bpm: number | null;
  timeSig: string | null;
  downbeat: number;
  key: string | null;
  transpose: number;
  loops: SavedLoop[];
  /** Level (0..100) and mute per part, by part name. */
  mix: Record<string, { level: number; muted: boolean }>;
  /** Name of the original recording inside the zip, if any. */
  file?: string;
}

export interface Project {
  meta: ProjectMeta;
  file: File | null;
  takes: Float32Array[];
  sampleRate: number;
}

export function buildProject(meta: ProjectMeta, file: { name: string; bytes: Uint8Array } | null, takes: Float32Array[], sampleRate: number): Uint8Array<ArrayBuffer> {
  const entries = [{ name: "project.json", data: textBytes(JSON.stringify({ ...meta, file: file ? `original/${file.name}` : undefined }, null, 2)) }];
  if (file) entries.push({ name: `original/${file.name}`, data: file.bytes });
  takes.forEach((t, k) => entries.push({ name: `takes/Take ${k + 1}.wav`, data: encodeWav(t, sampleRate) }));
  return writeZip(entries);
}

/** Field-by-field check of `project.json`; odd values fall back to nothing rather than failing. */
export function parseMeta(text: string): ProjectMeta {
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("project.json is not valid.");
  }
  if (!v || typeof v !== "object" || typeof v.name !== "string" || v.name.length === 0 || v.name.length > 200) throw new Error("project.json has no song name.");
  const num = (x: unknown, lo: number, hi: number) => (typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi ? x : null);
  const mix: ProjectMeta["mix"] = {};
  if (v.mix && typeof v.mix === "object") {
    for (const [name, m] of Object.entries(v.mix as Record<string, unknown>)) {
      if (!m || typeof m !== "object" || name.length > 60) continue;
      const { level, muted } = m as Record<string, unknown>;
      mix[name] = { level: num(level, 0, 100) ?? 100, muted: muted === true };
    }
  }
  return {
    version: 1,
    name: v.name,
    bpm: num(v.bpm, 30, 300),
    timeSig: typeof v.timeSig === "string" && /^\d{1,2}\/\d{1,2}$/.test(v.timeSig) ? v.timeSig : null,
    downbeat: num(v.downbeat, 0, 3600) ?? 0,
    key: typeof v.key === "string" && v.key.length <= 20 ? v.key : null,
    transpose: Math.round(num(v.transpose, -12, 12) ?? 0),
    loops: parseLoops(v.loops),
    mix,
    file: typeof v.file === "string" && v.file.startsWith("original/") ? v.file : undefined,
  };
}

export function isProjectFile(file: { name: string }): boolean {
  return /\.zip$/i.test(file.name);
}

export function parseProject(bytes: Uint8Array): Project {
  const entries = readZip(bytes);
  const json = entries.find((e) => e.name === "project.json");
  if (!json) throw new Error("This zip is not a project file: no project.json inside.");
  const meta = parseMeta(bytesText(json.data));
  let file: File | null = null;
  if (meta.file) {
    const e = entries.find((x) => x.name === meta.file);
    if (e) file = new File([e.data as BlobPart], meta.file.slice("original/".length));
  }
  const takes: Float32Array[] = [];
  let sampleRate = 48000;
  for (let k = 1; ; k++) {
    const e = entries.find((x) => x.name === `takes/Take ${k}.wav`);
    if (!e) break;
    const w = decodeWav(e.data);
    takes.push(w.samples);
    sampleRate = w.sampleRate;
  }
  return { meta, file, takes, sampleRate };
}
