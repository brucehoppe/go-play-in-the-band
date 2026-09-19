import { useRef, useState } from "react";
import { Engine } from "./audio/engine";
import { mixToMono } from "./audio/mono";
import { computePeaks } from "./audio/peaks";
import { DEMO_INFO, synthDemo } from "./data/demo";
import type { SongInfo } from "./types";
import { Header } from "./ui/Header";
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

  async function open(name: string, getChannels: (e: Engine) => Promise<Float32Array[]>, meta: Meta) {
    setBusy(true);
    setError(null);
    try {
      const e = engine();
      await e.init();
      e.pause();
      const channels = await getChannels(e);
      e.load(channels);
      const overview = await computePeaks(mixToMono(channels), PEAK_BUCKETS);
      setPeaks(overview);
      setSong({ name, duration: channels[0].length / e.sampleRate, ...meta, stemCount: 1 });
      setPosition(0);
      setPlaying(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong loading that recording.");
    } finally {
      setBusy(false);
    }
  }

  const openFile = (file: File) => open(file.name, (e) => e.decode(file), UNKNOWN);
  const openDemo = () =>
    open(DEMO_INFO.name, async (e) => synthDemo(e.sampleRate), {
      bpm: DEMO_INFO.bpm,
      timeSig: DEMO_INFO.timeSig,
      key: DEMO_INFO.key,
    });

  return (
    <div className="app">
      <Header song={song} busy={busy} onPickFile={openFile} onLoadDemo={openDemo} />
      <main className="main">
        <SongPanel
          peaks={peaks}
          duration={song?.duration ?? 0}
          position={position}
          onSeek={(s) => engine().seek(s)}
        />
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
