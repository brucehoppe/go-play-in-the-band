/** The only module that talks to the instrument splitter on this computer. Absent server means demo mode. */
const BASE = "http://127.0.0.1:8765";

export interface SeparateResult {
  hash: string;
  stems: string[];
  cached: boolean;
}

/** True when the local backend answers within a second. Never throws. */
export async function serverAvailable(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1000) });
    return r.ok && (await r.json()).ok === true;
  } catch {
    return false;
  }
}

export async function separate(file: File): Promise<SeparateResult> {
  const body = new FormData();
  body.append("file", file);
  const r = await fetch(`${BASE}/separate`, { method: "POST", body });
  if (!r.ok) throw new Error(r.status === 501 ? "Install demucs to split a recording into parts." : "The local backend could not separate that file.");
  return r.json();
}

/** Fetch one separated stem as a WAV file. */
export async function fetchStem(hash: string, name: string): Promise<File> {
  const r = await fetch(`${BASE}/stems/${hash}/${encodeURIComponent(name)}`);
  if (!r.ok) throw new Error("Could not fetch a separated part.");
  return new File([await r.blob()], name, { type: "audio/wav" });
}
