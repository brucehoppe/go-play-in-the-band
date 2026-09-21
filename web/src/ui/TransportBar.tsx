import { formatTime } from "../lib/time";

interface Props {
  position: number;
  duration: number;
  playing: boolean;
  disabled: boolean;
  onToggle: () => void;
  onRewind: () => void;
  speed: number;
  preparing: boolean;
  onSpeed: (speed: number) => void;
  recording: boolean;
  hasTake: boolean;
  onRecord: () => void;
  onExport: () => void;
  onCalibrate: () => void;
}

const SPEEDS = [0.5, 0.75, 0.9, 1];

export function TransportBar({ position, duration, playing, disabled, onToggle, onRewind, speed, preparing, onSpeed, recording, hasTake, onRecord, onExport, onCalibrate }: Props) {
  return (
    <footer className="transport">
      <div className="time" aria-live="off">
        {formatTime(position)} / {formatTime(duration)}
      </div>
      <button disabled={disabled} onClick={onRewind} aria-label="Back to start">⏮</button>
      <button className="play" disabled={disabled} onClick={onToggle} aria-label={playing ? "Pause" : "Play"}>
        {playing ? "❚❚" : "▶"}
      </button>
      <button disabled={disabled} aria-pressed={recording} className={recording ? "on" : ""} onClick={onRecord}>
        {recording ? "■ Stop take" : "● Record"}
      </button>
      <button disabled={disabled || recording} onClick={onCalibrate}>Calibrate</button>
      <button disabled={!hasTake || recording} onClick={onExport}>Export WAV</button>
      <div className="speeds" role="group" aria-label="Speed">
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
        {preparing && <span role="status">Preparing {Math.round(speed * 100)}%…</span>}
      </div>
    </footer>
  );
}
