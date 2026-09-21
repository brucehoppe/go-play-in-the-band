import { useEffect, useState } from "react";
import { parseBpm } from "../lib/songtools";
import type { SongInfo } from "../types";

interface Props {
  song: SongInfo;
  busy: boolean;
  /** Playback speed, 0.5..1, to show the tempo you actually hear. */
  speed: number;
  hasClick: boolean;
  onBpm: (bpm: number) => void;
  onClick: () => void;
}

/** Helpers for building a song: tempo (estimated, editable), key and a click track. */
export function SongTools({ song, busy, speed, hasClick, onBpm, onClick }: Props) {
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
          Song tempo (BPM)
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
      <p className="hint">
        This is the song's own tempo, used for the bar grid and the click. It does not change playback: use the tempo slider
        in the bar below for that.{song.bpm ? ` You are hearing ${Math.round(song.bpm * speed)} BPM (${Math.round(speed * 100)}%).` : ""}
      </p>
      {song.estimated && (
        <p className="hint">Tempo and key are estimates from the audio. If the grid feels twice too fast or slow, use ½× or 2×, or type the tempo.</p>
      )}
      <div className="tools-row">
        <button disabled={busy || !song.bpm || hasClick} onClick={onClick}>Add click track</button>
      </div>
    </section>
  );
}
