import type { LoopRange } from "../lib/loop";
import { xToSeconds } from "../lib/time";
import type { Section } from "../types";
import { useWaveCanvas } from "./useWaveCanvas";

interface Props {
  peaks: Float32Array | null;
  duration: number;
  position: number;
  loop: LoopRange | null;
  looping: boolean;
  sections: Section[];
  onSeek: (seconds: number) => void;
  onPickSection: (section: Section) => void;
}

const STEP = 5; // seconds per arrow key

export function SongPanel({ peaks, duration, position, loop, looping, sections, onSeek, onPickSection }: Props) {
  const { box, canvas } = useWaveCanvas(peaks);

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
        {loop && duration > 0 && (
          <div
            className={looping ? "loopband on" : "loopband"}
            style={{ left: `${(loop.start / duration) * 100}%`, width: `${((loop.end - loop.start) / duration) * 100}%` }}
          />
        )}
        <div className="playhead" style={{ left: `${pct}%` }} />
      </div>
      {sections.length > 0 && duration > 0 && (
        <div className="chips" role="group" aria-label="Song sections">
          {sections.map((sec) => (
            <button
              key={sec.name}
              className="chip"
              style={{ flexGrow: sec.end - sec.start }}
              onClick={() => onPickSection(sec)}
              aria-label={`Loop ${sec.name}`}
            >
              {sec.name}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
