import { useEffect, useState } from "react";
import { parseBpm } from "../lib/songtools";
import { addTap, tapBpm } from "../lib/tap";
import type { SongInfo } from "../types";

interface Props {
  song: SongInfo;
  busy: boolean;
  /** Playback speed, 0.25..1.25, to show the tempo you actually hear. */
  speed: number;
  hasClick: boolean;
  onBpm: (bpm: number) => void;
  onClick: () => void;
  onTimeSig: (timeSig: string) => void;
  /** Put bar 1 at the playhead. */
  onBarOneHere: () => void;
  /** Move bar 1 by `seconds` (can be negative). */
  onNudgeDownbeat: (seconds: number) => void;
  transpose: number;
  onTranspose: (semitones: number) => void;
}

export const TIME_SIGS = ["4/4", "3/4", "6/8", "2/4"];

/** Helpers for building a song: tempo (estimated, editable, tapped), time signature, bar 1, key, transpose and a click track. */
export function SongTools({ song, busy, speed, hasClick, onBpm, onClick, onTimeSig, onBarOneHere, onNudgeDownbeat, transpose, onTranspose }: Props) {
  const [text, setText] = useState(song.bpm ? String(song.bpm) : "");
  const [taps, setTaps] = useState<number[]>([]);
  useEffect(() => setText(song.bpm ? String(song.bpm) : ""), [song.bpm]);
  const commit = () => {
    const v = parseBpm(text);
    if (v && v !== song.bpm) onBpm(v);
    else setText(song.bpm ? String(song.bpm) : "");
  };
  const tap = () => {
    const next = addTap(taps, performance.now());
    setTaps(next);
    const bpm = tapBpm(next);
    if (bpm && next.length >= 3) onBpm(bpm);
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
        <button onClick={tap} aria-label="Tap tempo" title="Tap along with the song; the tempo follows after three taps">
          Tap{taps.length > 0 && taps.length < 3 ? ` (${taps.length})` : ""}
        </button>
        <label>
          Time
          <select value={song.timeSig ?? "4/4"} aria-label="Time signature" onChange={(e) => onTimeSig(e.target.value)}>
            {TIME_SIGS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <span className="tools-key">Key {song.key ?? "–"}</span>
      </div>
      <div className="tools-row">
        <button disabled={!song.bpm} onClick={onBarOneHere} title="The bar grid starts where the playhead is now">
          Bar 1 here
        </button>
        <button disabled={!song.bpm} onClick={() => onNudgeDownbeat(-0.01)} aria-label="Move bar 1 earlier by 10 milliseconds">◂ 10 ms</button>
        <button disabled={!song.bpm} onClick={() => onNudgeDownbeat(0.01)} aria-label="Move bar 1 later by 10 milliseconds">10 ms ▸</button>
        <span className="mono hint">bar 1 at {(song.downbeat ?? 0).toFixed(2)} s</span>
        <label>
          Transpose
          <select value={transpose} disabled={busy} onChange={(e) => onTranspose(Number(e.target.value))} aria-label="Transpose, semitones">
            {Array.from({ length: 25 }, (_, i) => i - 12).map((n) => (
              <option key={n} value={n}>{n > 0 ? `+${n}` : n === 0 ? "0 (original)" : n}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">
        This is the song's own tempo, used for the bar grid and the click. It does not change playback: use the tempo slider
        in the bar below for that.{song.bpm ? ` You are hearing ${Math.round(song.bpm * speed)} BPM (${Math.round(speed * 100)}%).` : ""}
        {transpose !== 0 ? ` Transposed ${transpose > 0 ? "up" : "down"} ${Math.abs(transpose)} semitone${Math.abs(transpose) === 1 ? "" : "s"}; takes are kept as played.` : ""}
      </p>
      {song.estimated && (
        <p className="hint">Tempo and key are estimates from the audio. If the grid feels twice too fast or slow, use ½× or 2×, tap along, or type the tempo. If bar lines land on the wrong beat, press Bar 1 here on a downbeat.</p>
      )}
      <div className="tools-row">
        <button disabled={busy || !song.bpm || hasClick} onClick={onClick}>Add click track</button>
      </div>
    </section>
  );
}
