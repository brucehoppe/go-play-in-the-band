import { useRef } from "react";
import type { SongInfo } from "../types";
import { formatTime } from "../lib/time";

interface Props {
  song: SongInfo | null;
  busy: boolean;
  onPickFile: (file: File) => void;
  onLoadDemo: () => void;
}

const dash = (v: string | number | null) => (v === null ? "—" : String(v));

export function Header({ song, busy, onPickFile, onLoadDemo }: Props) {
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
          <span>{song.stemCount} part{song.stemCount === 1 ? " (full mix)" : "s"}</span>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="audio/*,.wav,.mp3,.flac,.m4a"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPickFile(file);
          e.target.value = "";
        }}
      />
      <button disabled={busy} onClick={() => input.current?.click()}>Load recording</button>
      <button disabled={busy} onClick={onLoadDemo}>Try the demo song</button>
    </header>
  );
}
