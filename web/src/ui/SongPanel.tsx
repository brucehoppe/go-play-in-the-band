import { useEffect, useRef } from "react";
import { drawWaveform } from "../audio/waveform";
import { xToSeconds } from "../lib/time";

interface Props {
  peaks: Float32Array | null;
  duration: number;
  position: number;
  onSeek: (seconds: number) => void;
}

const AMBER = "#e8a93a";
const STEP = 5; // seconds per arrow key

export function SongPanel({ peaks, duration, position, onSeek }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = box.current;
    const cv = canvas.current;
    if (!el || !cv || !peaks) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = el.getBoundingClientRect();
      cv.width = Math.max(1, Math.floor(width * dpr));
      cv.height = Math.max(1, Math.floor(height * dpr));
      drawWaveform(cv.getContext("2d")!, peaks, cv.width, cv.height, AMBER);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [peaks]);

  if (!peaks) {
    return (
      <section className="panel">
        <h2>Whole song</h2>
        <p className="empty">Load a recording, or try the demo song, to see the whole song here.</p>
      </section>
    );
  }

  const pct = duration > 0 ? (position / duration) * 100 : 0;
  return (
    <section className="panel">
      <h2>Whole song</h2>
      <div
        ref={box}
        className="wave"
        role="slider"
        tabIndex={0}
        aria-label="Song position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(position)}
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onSeek(xToSeconds(e.clientX - r.left, r.width, duration));
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") onSeek(Math.min(duration, position + STEP));
          else if (e.key === "ArrowLeft") onSeek(Math.max(0, position - STEP));
          else return;
          e.preventDefault();
        }}
      >
        <canvas ref={canvas} />
        <div className="playhead" style={{ left: `${pct}%` }} />
      </div>
    </section>
  );
}
