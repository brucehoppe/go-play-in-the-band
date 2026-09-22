import { useEffect, useRef, useState } from "react";
import { pitchOf } from "../audio/analysis";
import { noteFor } from "../lib/chords";

interface Props {
  /** Opens the input and returns an analyser on it, or null when the microphone is refused. */
  listen: () => Promise<{ analyser: AnalyserNode; stop: () => void; sampleRate: number } | null>;
  /** Play a reference tone. */
  tone: (hz: number) => void;
  disabled: boolean;
}

const STRINGS = [
  { name: "E2", hz: 82.41 },
  { name: "A2", hz: 110 },
  { name: "D3", hz: 146.83 },
  { name: "G3", hz: 196 },
  { name: "B3", hz: 246.94 },
  { name: "E4", hz: 329.63 },
  { name: "A4", hz: 440 },
];
const WINDOW = 4096;
const EVERY_MS = 100;

/** A chromatic tuner on the chosen input, and reference tones for the open strings. */
export function Tuner({ listen, tone, disabled }: Props) {
  const [on, setOn] = useState(false);
  const [hz, setHz] = useState(0);
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    let timer = 0;
    void listen().then((mic) => {
      if (!mic || cancelled) {
        mic?.stop();
        if (!mic) setOn(false);
        return;
      }
      stopRef.current = mic.stop;
      const buf = new Float32Array(WINDOW);
      let busy = false;
      timer = window.setInterval(() => {
        if (busy) return;
        busy = true;
        mic.analyser.getFloatTimeDomainData(buf);
        pitchOf(buf, mic.sampleRate)
          .then((f) => {
            if (!cancelled) setHz(f);
          })
          .catch(() => {})
          .finally(() => {
            busy = false;
          });
      }, EVERY_MS);
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      stopRef.current();
      stopRef.current = () => {};
      setHz(0);
    };
  }, [on, listen]);

  const note = noteFor(hz);
  const cents = note?.cents ?? 0;
  const inTune = note !== null && Math.abs(cents) <= 5;
  return (
    <section className="panel tools tuner" aria-label="Tuner">
      <h2>Tuner</h2>
      <div className="tools-row">
        <button className="toggle" aria-pressed={on} disabled={disabled} onClick={() => setOn(!on)}>
          Tuner {on ? "on" : "off"}
        </button>
        <div className="tuner-read" role="status" aria-live="polite">
          <span className={`tuner-note${inTune ? " in-tune" : ""}`}>{note ? `${note.name}${note.octave}` : "–"}</span>
          <span className="mono hint">{note ? `${cents > 0 ? "+" : ""}${cents} cents · ${hz.toFixed(1)} Hz` : on ? "play one string" : ""}</span>
        </div>
      </div>
      <div className="needle-track" aria-hidden="true">
        <div className="needle-centre" />
        {note && <div className={`needle${inTune ? " in-tune" : ""}`} style={{ left: `${50 + Math.max(-50, Math.min(50, cents))}%` }} />}
      </div>
      <div className="tools-row" role="group" aria-label="Reference tones">
        {STRINGS.map((s) => (
          <button key={s.name} disabled={disabled} onClick={() => tone(s.hz)} title={`${s.hz} Hz`}>
            {s.name}
          </button>
        ))}
      </div>
    </section>
  );
}
