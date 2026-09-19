import { formatTime } from "../lib/time";

interface Props {
  position: number;
  duration: number;
  playing: boolean;
  disabled: boolean;
  onToggle: () => void;
  onRewind: () => void;
}

export function TransportBar({ position, duration, playing, disabled, onToggle, onRewind }: Props) {
  return (
    <footer className="transport">
      <div className="time" aria-live="off">
        {formatTime(position)} / {formatTime(duration)}
      </div>
      <button disabled={disabled} onClick={onRewind} aria-label="Back to start">⏮</button>
      <button className="play" disabled={disabled} onClick={onToggle} aria-label={playing ? "Pause" : "Play"}>
        {playing ? "❚❚" : "▶"}
      </button>
    </footer>
  );
}
