import { useRef } from "react";
import type { SongInfo } from "../types";
import { formatTime } from "../lib/time";

interface Props {
  song: SongInfo | null;
  busy: boolean;
  onPickFile: (file: File) => void;
  /** The demo songs on offer, by name. */
  demos: string[];
  onLoadDemo: (name: string) => void;
  /** Save everything about this song as one zip. Absent with nothing loaded. */
  onSaveProject?: () => void;
  /** Only in the local app: there is nothing to quit on the hosted demo. */
  onQuit?: () => void;
  /** Quit waits for a take in progress. */
  recording?: boolean;
}

const dash = (v: string | number | null) => (v === null ? "—" : String(v));

export function Header({ song, busy, onPickFile, demos, onLoadDemo, onSaveProject, onQuit, recording }: Props) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <header className="header">
      <h1>Go Play in the Band</h1>
      {song && (
        <div className="filecard" aria-label="Loaded recording">
          <strong>{song.name}</strong>
          <span className="mono">{formatTime(song.duration)}</span>
          <span>BPM <span className="mono">{dash(song.bpm)}</span></span>
          <span>Time <span className="mono">{dash(song.timeSig)}</span></span>
          <span>Key {dash(song.key)}</span>
          <span>{song.stemCount} part{song.stemCount === 1 ? "" : "s"}{song.fullMix ? " (full mix)" : ""}</span>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="audio/*,.wav,.mp3,.flac,.m4a,.zip"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPickFile(file);
          e.target.value = "";
        }}
      />
      <button disabled={busy} onClick={() => input.current?.click()} title="A WAV, MP3, FLAC or M4A recording, or a project zip saved here">
        Load recording
      </button>
      {demos.length === 1 ? (
        <button disabled={busy} onClick={() => onLoadDemo(demos[0])}>Try the demo song</button>
      ) : (
        <label className="demo-pick">
          <span className="sr-only">Try a demo song</span>
          <select
            disabled={busy}
            value=""
            aria-label="Try a demo song"
            onChange={(e) => {
              if (e.target.value) onLoadDemo(e.target.value);
              e.target.value = "";
            }}
          >
            <option value="">Try a demo song…</option>
            {demos.map((d) => (
              <option key={d} value={d}>{d.replace(/^Demo: /, "")}</option>
            ))}
          </select>
        </label>
      )}
      {onSaveProject && (
        <button disabled={busy || recording} onClick={onSaveProject} title="One zip with the recording, your takes, loops and mix">
          Save project
        </button>
      )}
      {onQuit && (
        <button className="quit" disabled={recording} title="Stop the app and the instrument splitter. Your takes are already saved." onClick={onQuit}>
          Quit
        </button>
      )}
    </header>
  );
}
