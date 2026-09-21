import { useEffect, useState } from "react";
import { parseBpm } from "../lib/songtools";
import type { SongInfo } from "../types";

interface Props {
  song: SongInfo;
  busy: boolean;
  canSplit: boolean;
  hasClick: boolean;
  onBpm: (bpm: number) => void;
  onSplit: () => void;
  onClick: () => void;
}

/** Helpers for building a song: tempo (estimated, editable), key, a click track and a quick split. */
export function SongTools({ song, busy, canSplit, hasClick, onBpm, onSplit, onClick }: Props) {
  const [text, setText] = useState(song.bpm ? String(song.bpm) : "");
  useEffect(() => setText(song.bpm ? String(song.bpm) : ""), [song.bpm]);
  const commit = () => {
    const v = parseBpm(text);
    if (v && v !== song.bpm) onBpm(v);
    else setText(song.bpm ? String(song.bpm) : "");
  };
  return (
    <section className="panel tools" aria-label="Song tools">
      <h2>Song tools</h2>
      <div className="tools-row">
        <label>
          Tempo (BPM)
          <input
            inputMode="decimal"
            value={text}
            placeholder="e.g. 120"
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
          />
        </label>
        <button disabled={!song.bpm || song.bpm / 2 < 30} onClick={() => song.bpm && onBpm(song.bpm / 2)}>½×</button>
        <button disabled={!song.bpm || song.bpm * 2 > 300} onClick={() => song.bpm && onBpm(song.bpm * 2)}>2×</button>
        <span className="tools-key">Key {song.key ?? "–"}</span>
      </div>
      {song.estimated && (
        <p className="hint">Tempo and key are estimates from the audio. If the grid feels twice too fast or slow, use ½× or 2×, or type the tempo.</p>
      )}
      <div className="tools-row">
        <button disabled={busy || !song.bpm || hasClick} onClick={onClick}>Add click track</button>
        <button disabled={busy || !canSplit} onClick={onSplit}>Quick split into parts</button>
      </div>
      <p className="hint">
        Quick split is plain signal processing, not AI: it pulls apart drums-like hits, low bass and everything else. It cannot
        lift out one instrument such as the guitar; that needs the optional local backend.
      </p>
    </section>
  );
}
