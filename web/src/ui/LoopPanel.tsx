import { useEffect, useMemo, useRef, useState } from "react";
import { computePeaks } from "../audio/peaks";
import type { SavedLoop } from "../data/loops";
import { chordName } from "../lib/chords";
import { barSeconds, gridLines } from "../lib/grid";
import { loopName, moveHandle } from "../lib/loop";
import type { LoopRange } from "../lib/loop";
import { cleanProgressive } from "../lib/progressive";
import type { Progressive } from "../lib/progressive";
import { formatTime } from "../lib/time";
import { useWaveCanvas } from "./useWaveCanvas";

interface Props {
  duration: number;
  position: number;
  loop: LoopRange | null;
  looping: boolean;
  bpm: number | null;
  /** Seconds to the start of bar 1. */
  downbeat: number;
  beatsPerBar: number | null;
  sampleRate: number;
  /** Mono mixes: `band` is everything but the original guitar, `guitar` is null for a single-mix song. Read only; slices are copied before use. */
  getLayers: () => { band: Float32Array; guitar: Float32Array | null } | null;
  /** Original guitar level, 0..1 (0 when muted). */
  guitarLevel: number;
  status: string;
  onLoopChange: (loop: LoopRange, announce: boolean) => void;
  onToggle: () => void;
  onSetIn: () => void;
  onSetOut: () => void;
  onSnap: () => void;
  /** Loops saved for this song. */
  savedLoops: SavedLoop[];
  onSaveLoop: (name: string) => void;
  onDeleteLoop: (name: string) => void;
  onPickLoop: (loop: SavedLoop) => void;
  /** One bar of clicks before play starts. */
  countIn: boolean;
  onCountIn: (on: boolean) => void;
  progressive: Progressive;
  onProgressive: (p: Progressive) => void;
  /** Complete passes of the loop since it was set. */
  passes: number;
  /** Chord index per bar of the song (see `chordName`), or null. */
  chords: Int32Array | null;
}

const PAD = 1; // seconds of context shown each side of the loop
const BUCKETS = 1200;
const NUDGE = 0.1;
const NUDGE_BIG = 1;
const MAX_LINES = 120;

interface Zoom {
  peaks: Float32Array;
  guitar: Float32Array | null;
  from: number;
  to: number;
}

export function LoopPanel(p: Props) {
  const { duration, loop } = p;
  const tempo = p.bpm && p.beatsPerBar ? { bpm: p.bpm, bpb: p.beatsPerBar } : null;
  const [zoom, setZoom] = useState<Zoom | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const { box, canvas } = useWaveCanvas(zoom?.peaks ?? null, { peaks: zoom?.guitar ?? null, scale: p.guitarLevel });
  const dragging = useRef(false);
  const latest = useRef<LoopRange | null>(loop);
  latest.current = loop;

  // Zoomed peaks from the mono mix of the loop plus padding, debounced while the loop is edited.
  useEffect(() => {
    if (!loop) {
      setZoom(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const layers = p.getLayers();
      if (!layers) return;
      const mono = layers.band;
      const from = Math.max(0, loop.start - PAD);
      const to = Math.min(duration, loop.end + PAD);
      const a = Math.floor(from * p.sampleRate);
      const b = Math.min(mono.length, Math.ceil(to * p.sampleRate));
      if (b - a < 2) return;
      // Band and guitar peaks are computed together, so the two layers always cover the same window.
      Promise.all([
        computePeaks(mono.slice(a, b), BUCKETS),
        layers.guitar ? computePeaks(layers.guitar.slice(a, b), BUCKETS) : Promise.resolve(null),
      ]).then(
        ([peaks, guitar]) => {
          if (!cancelled) setZoom({ peaks, guitar, from, to });
        },
        () => {},
      );
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loop?.start, loop?.end, duration, p.sampleRate]);

  // The view stays on the window the peaks were computed for, so drags do not jitter.
  const from = zoom?.from ?? (loop ? Math.max(0, loop.start - PAD) : 0);
  const to = zoom?.to ?? (loop ? Math.min(duration, loop.end + PAD) : 1);
  const span = Math.max(1e-6, to - from);
  const pct = (t: number) => Math.max(0, Math.min(100, ((t - from) / span) * 100));
  const inView = (t: number) => t >= from && t <= to;

  const lines = useMemo(() => {
    if (!tempo || !loop) return [];
    const all = gridLines(from, to, tempo.bpm, tempo.bpb, p.downbeat);
    return all.length > MAX_LINES ? all.filter((l) => l.bar !== null) : all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, p.bpm, p.beatsPerBar, p.downbeat, !!loop]);

  const snapReason = tempo ? null : "Snap needs a known tempo";
  const bar = tempo ? barSeconds(tempo.bpm, tempo.bpb) : 0;
  void bar;
  const chordAt = (barNo: number | null) => (barNo !== null && p.chords && barNo - 1 < p.chords.length ? chordName(p.chords[barNo - 1]) : null);

  const prog = p.progressive;
  const setProg = (patch: Partial<Progressive>) => p.onProgressive(cleanProgressive({ ...prog, ...patch }));
  const commitSave = () => {
    const name = saveName.trim();
    if (name) p.onSaveLoop(name);
    setSaveName("");
    setSaving(false);
  };

  function handle(which: "in" | "out") {
    const value = loop ? (which === "in" ? loop.start : loop.end) : 0;
    const label = which === "in" ? "Loop in" : "Loop out";
    const at = (clientX: number, el: HTMLElement) => {
      const r = el.parentElement!.getBoundingClientRect();
      return from + Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * span;
    };
    return (
      <div
        className={`handle ${which}`}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration * 10) / 10}
        aria-valuenow={Math.round(value * 10) / 10}
        aria-valuetext={formatTime(value)}
        style={{ left: `${pct(value)}%` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = true;
        }}
        onPointerMove={(e) => {
          if (!dragging.current || !latest.current) return;
          p.onLoopChange(moveHandle(latest.current, which, at(e.clientX, e.currentTarget), duration), false);
        }}
        onPointerUp={() => {
          if (!dragging.current) return;
          dragging.current = false;
          if (latest.current) p.onLoopChange(latest.current, true);
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
        onKeyDown={(e) => {
          if (!latest.current) return;
          const d = e.shiftKey ? NUDGE_BIG : NUDGE;
          if (e.key === "ArrowRight" || e.key === "ArrowUp") p.onLoopChange(moveHandle(latest.current, which, value + d, duration), false);
          else if (e.key === "ArrowLeft" || e.key === "ArrowDown") p.onLoopChange(moveHandle(latest.current, which, value - d, duration), false);
          else return;
          e.preventDefault();
        }}
      >
        <span className="grip" />
      </div>
    );
  }

  return (
    <section className="panel loop-panel" aria-label="Loop">
      <div className="loop-head">
        <h2>{loop ? loopName(loop, p.bpm, p.beatsPerBar) : "Loop"}</h2>
        {p.looping && p.passes > 0 && <span className="mono hint">pass {p.passes + 1}</span>}
        <button className="toggle" aria-pressed={p.looping} disabled={!loop} onClick={p.onToggle}>
          Looping {p.looping ? "on" : "off"}
        </button>
      </div>
      {loop ? (
        <p className="mono loop-times">
          {formatTime(loop.start)} → {formatTime(loop.end)} · length {formatTime(loop.end - loop.start)}
        </p>
      ) : (
        <p className="empty">No loop yet. Pick a section, or press Set in and Set out while it plays.</p>
      )}
      <div className="loop-actions">
        <button onClick={p.onSetIn}>Set in</button>
        <button onClick={p.onSetOut}>Set out</button>
        <button onClick={p.onSnap} disabled={!loop || !!snapReason} aria-describedby={snapReason ? "snap-why" : undefined}>
          Snap to bars
        </button>
        {snapReason && (
          <span id="snap-why" className="hint">
            {snapReason}
          </span>
        )}
        {loop && !saving && (
          <button onClick={() => setSaving(true)} title="Keep this loop under a name, so you can come back to it">
            Save loop
          </button>
        )}
        {loop && saving && (
          <span className="save-loop">
            <input
              autoFocus
              aria-label="Loop name"
              placeholder="Name, e.g. Solo"
              maxLength={40}
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitSave();
                else if (e.key === "Escape") setSaving(false);
              }}
            />
            <button onClick={commitSave} disabled={!saveName.trim()}>
              Save
            </button>
            <button onClick={() => setSaving(false)}>Cancel</button>
          </span>
        )}
        <label className="toggle-line">
          <input type="checkbox" checked={p.countIn} disabled={!tempo} onChange={(e) => p.onCountIn(e.target.checked)} />
          Count-in{tempo ? "" : " (needs a tempo)"}
        </label>
      </div>
      {p.savedLoops.length > 0 && (
        <div className="chips saved" role="group" aria-label="Saved loops">
          {p.savedLoops.map((l) => (
            <span key={l.name} className="chip-wrap">
              <button className="chip" onClick={() => p.onPickLoop(l)} aria-label={`Loop ${l.name}`} title={`${formatTime(l.start)} to ${formatTime(l.end)}`}>
                {l.name}
              </button>
              <button className="chip-x" aria-label={`Delete loop ${l.name}`} onClick={() => p.onDeleteLoop(l.name)}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {loop && (
        <div ref={box} className="zoom" role="group" aria-label="Loop waveform">
          <canvas ref={canvas} />
          <div className="pad" style={{ left: 0, width: `${pct(loop.start)}%` }} />
          <div className="pad" style={{ left: `${pct(loop.end)}%`, right: 0 }} />
          {lines.map((l) => (
            <div key={l.sec} className={l.bar !== null ? "gl bar" : "gl"} style={{ left: `${pct(l.sec)}%` }}>
              {l.bar !== null && <span className="gl-num">{l.bar}</span>}
              {chordAt(l.bar) && <span className="gl-chord">{chordAt(l.bar)}</span>}
            </div>
          ))}
          {inView(p.position) && <div className="playhead" style={{ left: `${pct(p.position)}%` }} />}
          {handle("in")}
          {handle("out")}
        </div>
      )}
      {loop && (
        <p className="legend hint">
          <span className="swatch band" aria-hidden="true" /> Band
          {zoom?.guitar && (
            <>
              <span className="swatch guitar" aria-hidden="true" /> Original guitar
            </>
          )}
        </p>
      )}
      {loop && (
        <details className="progressive" open={prog.on}>
          <summary>
            Progressive tempo{prog.on ? `: ${prog.from}% → ${prog.to}%, +${prog.step}% every ${prog.every} pass${prog.every === 1 ? "" : "es"}` : ""}
          </summary>
          <div className="tools-row">
            <label className="toggle-line">
              <input type="checkbox" aria-label="Progressive tempo on" checked={prog.on} disabled={!p.looping} onChange={(e) => setProg({ on: e.target.checked })} />
              On{p.looping ? "" : " (turn looping on first)"}
            </label>
            <label>
              Start %
              <input inputMode="numeric" aria-label="Start %" value={prog.from} onChange={(e) => setProg({ from: Number(e.target.value) })} />
            </label>
            <label>
              Step %
              <input inputMode="numeric" aria-label="Step %" value={prog.step} onChange={(e) => setProg({ step: Number(e.target.value) })} />
            </label>
            <label>
              Every N passes
              <input inputMode="numeric" aria-label="Every N passes" value={prog.every} onChange={(e) => setProg({ every: Number(e.target.value) })} />
            </label>
            <label>
              Up to %
              <input inputMode="numeric" aria-label="Up to %" value={prog.to} onChange={(e) => setProg({ to: Number(e.target.value) })} />
            </label>
          </div>
          <p className="hint">Start slow, and every N passes of the loop the speed goes up a step. It stops at the top.</p>
        </details>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {p.status}
      </p>
    </section>
  );
}
