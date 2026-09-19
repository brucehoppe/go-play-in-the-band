import { useEffect, useRef, useState } from "react";
import { Engine } from "./audio/engine";
import { mixToMono } from "./audio/mono";
import { computePeaks } from "./audio/peaks";
import { DEMO_INFO, DEMO_SECTIONS, synthDemo } from "./data/demo";
import { barLabel, beatsPerBar, snapLoopToBars } from "./lib/grid";
import { loopName, setIn, setOut } from "./lib/loop";
import type { LoopRange } from "./lib/loop";
import type { Section, SongInfo, Stem } from "./types";
import { Header } from "./ui/Header";
import { LoopPanel } from "./ui/LoopPanel";
import { SongPanel } from "./ui/SongPanel";
import { TransportBar } from "./ui/TransportBar";

const PEAK_BUCKETS = 4096;

type Meta = Pick<SongInfo, "bpm" | "timeSig" | "key">;
const UNKNOWN: Meta = { bpm: null, timeSig: null, key: null };

export function App() {
  const engineRef = useRef<Engine | null>(null);
  const [song, setSong] = useState<SongInfo | null>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);
  const [loop, setLoop] = useState<LoopRange | null>(null);
  const [looping, setLooping] = useState(false);
  const [status, setStatus] = useState("");
  const monoRef = useRef<Float32Array | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The AudioContext is created on the first click, which browsers require.
  function engine(): Engine {
    if (!engineRef.current) {
      const e = new Engine();
      e.onPosition = (s, p) => {
        setPosition(s);
        setPlaying(p);
      };
      engineRef.current = e;
    }
    return engineRef.current;
  }

  // Push the loop to the audio thread whenever it changes.
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    if (loop && looping) e.setLoop(loop.start, loop.end);
    else e.clearLoop();
  }, [loop, looping]);

  const bpb = beatsPerBar(song?.timeSig ?? null);
  const announceLoop = (l: LoopRange) =>
    setStatus(`Loop set: ${song?.bpm && bpb ? barLabel(l.start, l.end, song.bpm, bpb) : loopName(l, null, null).replace("Loop, ", "")}`);
  function editLoop(l: LoopRange, announce = true) {
    setLoop(l);
    if (announce) announceLoop(l);
  }

  async function open(
    name: string,
    getStems: (e: Engine) => Promise<Stem[]>,
    meta: Meta,
    songSections: Section[] = [],
  ) {
    setBusy(true);
    setError(null);
    try {
      const e = engine();
      await e.init();
      e.pause();
      const stems = await getStems(e);
      e.load(stems);
      const mono = mixToMono(stems.flatMap((s) => s.channels));
      monoRef.current = mono;
      const overview = await computePeaks(mono.slice(), PEAK_BUCKETS);
      setPeaks(overview);
      setSong({ name, duration: stems[0].channels[0].length / e.sampleRate, ...meta, stemCount: stems.length });
      setSections(songSections);
      setLoop(null);
      setLooping(false);
      setStatus("");
      setPosition(0);
      setPlaying(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong loading that recording.");
    } finally {
      setBusy(false);
    }
  }

  const openFile = (file: File) => open(file.name, async (e) => [{ name: "Full mix", channels: await e.decode(file) }], UNKNOWN);
  const openDemo = () =>
    open(DEMO_INFO.name, async (e) => [{ name: "Full mix", channels: synthDemo(e.sampleRate) }], {
      bpm: DEMO_INFO.bpm,
      timeSig: DEMO_INFO.timeSig,
      key: DEMO_INFO.key,
    }, DEMO_SECTIONS);

  const defaultLen = () => (song?.bpm && bpb ? (60 / song.bpm) * bpb : 4);

  return (
    <div className="app">
      <Header song={song} busy={busy} onPickFile={openFile} onLoadDemo={openDemo} />
      <main className="main">
        <SongPanel
          peaks={peaks}
          duration={song?.duration ?? 0}
          position={position}
          loop={loop}
          looping={looping}
          sections={sections}
          onSeek={(s) => engine().seek(s)}
          onPickSection={(sec) => {
            editLoop({ start: sec.start, end: sec.end });
            engine().seek(sec.start);
          }}
        />
        {song && (
          <LoopPanel
            duration={song.duration}
            position={position}
            loop={loop}
            looping={looping}
            bpm={song.bpm}
            beatsPerBar={bpb}
            sampleRate={engineRef.current?.sampleRate ?? 48000}
            getMono={() => monoRef.current}
            status={status}
            onLoopChange={editLoop}
            onToggle={() => {
              const next = !looping;
              setLooping(next);
              setStatus(`Looping ${next ? "on" : "off"}`);
            }}
            onSetIn={() => editLoop(setIn(loop, position, song.duration, defaultLen()))}
            onSetOut={() => editLoop(setOut(loop, position, song.duration, defaultLen()))}
            onSnap={() => {
              if (!loop || !song.bpm || !bpb) return;
              const [start, end] = snapLoopToBars(loop.start, loop.end, song.bpm, bpb, song.duration);
              editLoop({ start, end });
            }}
          />
        )}
        {busy && <p className="empty" role="status">Reading the recording…</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </main>
      <TransportBar
        position={position}
        duration={song?.duration ?? 0}
        playing={playing}
        disabled={!song || busy}
        onToggle={() => (playing ? engine().pause() : void engine().play())}
        onRewind={() => engine().seek(0)}
      />
    </div>
  );
}
