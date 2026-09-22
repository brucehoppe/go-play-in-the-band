import { useEffect, useState } from "react";
import { formatTime } from "../lib/time";

interface Props {
  position: number;
  duration: number;
  playing: boolean;
  /** The count-in ticks are playing; the song starts after them. */
  countingIn: boolean;
  disabled: boolean;
  /** Record works with nothing loaded: the first take becomes the song. */
  canRecord: boolean;
  onToggle: () => void;
  onRewind: () => void;
  speed: number;
  preparing: boolean;
  onSpeed: (speed: number) => void;
  /** The song's own tempo, to show the tempo you hear at this speed. */
  bpm: number | null;
  recording: boolean;
  hasTake: boolean;
  onRecord: () => void;
  onExport: () => void;
  onExportParts: () => void;
  onCalibrate: () => void;
}

const SPEEDS = [0.25, 0.5, 0.75, 1];

export function TransportBar({ position, duration, playing, countingIn, disabled, canRecord, onToggle, onRewind, speed, preparing, onSpeed, bpm, recording, hasTake, onRecord, onExport, onExportParts, onCalibrate }: Props) {
  // The slider moves freely; the audio is re-rendered once, when you let go.
  const [drag, setDrag] = useState(Math.round(speed * 100));
  useEffect(() => setDrag(Math.round(speed * 100)), [speed]);
  const commit = () => drag / 100 !== speed && onSpeed(drag / 100);
  return (
    <footer className="transport">
      <div className="time" aria-live="off">
        {formatTime(position)} / {formatTime(duration)}
        {countingIn && <span className="count-in-tag"> count-in</span>}
      </div>
      <button disabled={disabled} onClick={onRewind} aria-label="Back to start">⏮</button>
      <button className="play" disabled={disabled} onClick={onToggle} aria-label={playing ? "Pause" : "Play"}>
        {playing ? "❚❚" : "▶"}
      </button>
      <button disabled={!canRecord} aria-pressed={recording} className={recording ? "on" : ""} onClick={onRecord}>
        {recording ? "■ Stop take" : "● Record"}
      </button>
      <button disabled={disabled || recording} onClick={onCalibrate}>Calibrate</button>
      <button disabled={!hasTake || recording} onClick={onExport} title="What you hear, as one WAV">Export mix</button>
      <button disabled={!hasTake || recording} onClick={onExportParts} title="One WAV per part, in a zip">Export parts</button>
      <div className="speeds" role="group" aria-label="Slow down or speed up">
        <span className="speeds-label">Slow down</span>
        {SPEEDS.map((v) => (
          <button
            key={v}
            disabled={disabled || preparing}
            aria-pressed={v === speed}
            className={v === speed ? "on" : ""}
            onClick={() => onSpeed(v)}
          >
            {Math.round(v * 100)}%
          </button>
        ))}
        <label className="tempo-slider">
          <span className="mono">
            {drag}%{bpm ? ` · ${Math.round((bpm * drag) / 100)} BPM` : ""}
          </span>
          <input
            type="range"
            min={25}
            max={125}
            step={5}
            value={drag}
            disabled={disabled || preparing}
            aria-label="Playback tempo, percent of the original"
            onChange={(e) => setDrag(Number(e.target.value))}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={commit}
          />
        </label>
        {preparing && <span role="status">Preparing {Math.round(speed * 100)}%…</span>}
      </div>
    </footer>
  );
}
