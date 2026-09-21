import { useEffect, useRef, useState } from "react";
import { Engine } from "./audio/engine";
import { alignTake, encodeWav, mixParts, placeTake } from "./audio/take";
import type { Recorder } from "./audio/recorder";
import { sumMono } from "./audio/mono";
import { computePeaks } from "./audio/peaks";
import { fetchStem, separate, serverAvailable } from "./data/server";
import { loadTakes, saveTake } from "./data/takes";
import { DEMO_INFO, DEMO_SECTIONS, GUITAR_STEM, synthDemoStems } from "./data/demo";
import { barLabel, beatsPerBar, snapLoopToBars } from "./lib/grid";
import { loopName, setIn, setOut } from "./lib/loop";
import type { LoopRange } from "./lib/loop";
import type { Section, SongInfo, Stem } from "./types";
import { BandMixer } from "./ui/BandMixer";
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
  const [stemNames, setStemNames] = useState<string[]>([]);
  const [levels, setLevels] = useState<number[]>([]);
  const [muted, setMuted] = useState<boolean[]>([]);
  const monoRef = useRef<Float32Array | null>(null);
  const layersRef = useRef<{ band: Float32Array; guitar: Float32Array | null } | null>(null);
  const [speed, setSpeed] = useState(1);
  const [preparing, setPreparing] = useState(false);
  const [recording, setRecording] = useState(false);
  const stemsRef = useRef<Stem[]>([]);
  const takeCountRef = useRef(0);
  const recordFromRef = useRef(0);
  const [latency, setLatency] = useState(() => {
    try {
      const v = Number(localStorage.getItem("gpitb:latency"));
      return Number.isFinite(v) && v >= 0 && v < 48000 ? v : 0;
    } catch {
      return 0;
    }
  });
  const recorderRef = useRef<Recorder | null>(null);
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

  /** Rebuild the waveform layers and overview from the current parts. */
  async function refreshViews(stems: Stem[]) {
    stemsRef.current = stems;
    const gi = stems.findIndex((s) => s.name === GUITAR_STEM);
    const band = sumMono(stems.filter((_, k) => k !== gi).map((s) => s.channels));
    const guitar = gi >= 0 ? sumMono([stems[gi].channels]) : null;
    layersRef.current = { band, guitar };
    const mono = guitar ? band.map((v, k) => v + guitar[k]) : band;
    monoRef.current = mono;
    setPeaks(await computePeaks(mono.slice(), PEAK_BUCKETS));
  }

  async function open(
    name: string,
    getStems: (e: Engine) => Promise<Stem[]>,
    meta: Meta,
    songSections: Section[] = [],
    restoreTakes = true,
  ) {
    setBusy(true);
    setError(null);
    try {
      const e = engine();
      await e.init();
      e.pause();
      const stems = await getStems(e);
      // Takes recorded over this song earlier come back as parts.
      const saved = restoreTakes ? await loadTakes(name) : [];
      takeCountRef.current = saved.length;
      const length = stems[0].channels[0].length;
      saved.forEach((t, k) => stems.push({ name: `Take ${k + 1}`, channels: [placeTake(t, 0, length)] }));
      e.load(stems);
      await refreshViews(stems);
      setSong({ name, duration: stems[0].channels[0].length / e.sampleRate, ...meta, stemCount: stems.length });
      setStemNames(stems.map((s) => s.name));
      setLevels(stems.map(() => 100));
      setMuted(stems.map(() => false));
      setSections(songSections);
      setSpeed(1);
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

  const openFile = (file: File) =>
    open(file.name, async (e) => {
      // With the local backend running, split the recording into parts; otherwise it stays one "Full mix".
      if (await serverAvailable()) {
        try {
          setStatus("Splitting into parts on this computer. This can take a few minutes.");
          const result = await separate(file);
          return await Promise.all(
            result.stems.map(async (n) => ({ name: n.replace(/\.wav$/, ""), channels: await e.decode(await fetchStem(result.hash, n)) })),
          );
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not split that recording.");
        }
      }
      return [{ name: "Full mix", channels: await e.decode(file) }];
    }, UNKNOWN);
  const openDemo = () =>
    open(DEMO_INFO.name, async (e) => synthDemoStems(e.sampleRate), {
      bpm: DEMO_INFO.bpm,
      timeSig: DEMO_INFO.timeSig,
      key: DEMO_INFO.key,
    }, DEMO_SECTIONS);

  // Levels live here and reach the audio thread the moment they change.
  function setLevel(i: number, level: number) {
    setLevels((prev) => prev.map((v, k) => (k === i ? level : v)));
    engine().setStemGain(i, level / 100, muted[i] ?? false);
  }
  function toggleMute(i: number) {
    const next = !muted[i];
    setMuted((prev) => prev.map((v, k) => (k === i ? next : v)));
    engine().setStemGain(i, (levels[i] ?? 100) / 100, next);
  }

  async function changeSpeed(next: number) {
    setPreparing(true);
    setSpeed(next);
    try {
      await engine().setSpeed(next);
    } catch {
      setError("Could not change the speed.");
    } finally {
      setPreparing(false);
    }
  }

  // Each take becomes another part in the mixer, so you can keep recording on top (overdub).
  async function toggleRecord() {
    try {
      const e = engine();
      await e.init();
      if (!recording) {
        if (speed !== 1) {
          setStatus("Set the speed to 100% to record a take.");
          return;
        }
        const r = e.recorder();
        await r.start();
        recorderRef.current = r;
        recordFromRef.current = song ? position : 0;
        setRecording(true);
        if (song) await e.play();
        return;
      }
      e.pause();
      const raw = await recorderRef.current!.stop();
      setRecording(false);
      const aligned = alignTake(raw, latency);
      if (aligned.length === 0) return;
      const n = takeCountRef.current + 1;
      if (!song) {
        // Nothing loaded: this take is the song, and the next takes go on top of it.
        await open("My recording", async () => [{ name: "Take 1", channels: [aligned] }], UNKNOWN, [], false);
        takeCountRef.current = 1;
        void saveTake("take:My recording:1", aligned);
        setStatus("Take 1 recorded. Press Record again to overdub. Use headphones so the band is not re-recorded.");
        return;
      }
      const length = stemsRef.current[0].channels[0].length;
      const placed = placeTake(aligned, recordFromRef.current * e.sampleRate, length);
      const stem: Stem = { name: `Take ${n}`, channels: [placed] };
      await e.addStem(stem);
      e.seek(recordFromRef.current);
      takeCountRef.current = n;
      void saveTake(`take:${song.name}:${n}`, placed);
      await refreshViews([...stemsRef.current, stem]);
      setStemNames((p) => [...p, stem.name]);
      setLevels((p) => [...p, 100]);
      setMuted((p) => [...p, false]);
      setSong({ ...song, stemCount: song.stemCount + 1 });
      setStatus(`Take ${n} recorded as a new part. Press Record again to overdub.`);
    } catch {
      setRecording(false);
      setError("Could not use the microphone. Allow access and try again.");
    }
  }

  async function calibrate() {
    try {
      const e = engine();
      await e.init();
      setStatus("Calibrating: keep the room quiet and the speakers audible to the mic.");
      const frames = await e.calibrate();
      setLatency(frames);
      try {
        localStorage.setItem("gpitb:latency", String(frames));
      } catch {
        /* storage unavailable: keep it for this session only */
      }
      setStatus(frames ? `Calibrated: ${Math.round((frames / e.sampleRate) * 1000)} ms.` : "Did not hear the click. Turn the volume up and try again.");
    } catch {
      setError("Could not use the microphone. Allow access and try again.");
    }
  }

  /** Export what you hear: every part at its level, muted parts left out. */
  function exportTake() {
    const stems = stemsRef.current;
    if (stems.length === 0) return;
    const parts = stems.map((st) => sumMono([st.channels]));
    const gains = stems.map((_, k) => (muted[k] ? 0 : (levels[k] ?? 100) / 100));
    const wav = encodeWav(mixParts(parts, gains), engine().sampleRate);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    a.download = "mix.wav";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const guitarIndex = stemNames.indexOf(GUITAR_STEM);
  const guitarLevel = guitarIndex >= 0 && !muted[guitarIndex] ? (levels[guitarIndex] ?? 100) / 100 : 0;

  const defaultLen = () => (song?.bpm && bpb ? (60 / song.bpm) * bpb : 4);

  return (
    <div className="app">
      <Header song={song} busy={busy} onPickFile={openFile} onLoadDemo={openDemo} />
      <main className="main">
        <div className="layout">
        <div className="col">
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
            getLayers={() => layersRef.current}
            guitarLevel={guitarLevel}
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
        </div>
        {song && (
          <BandMixer
            names={stemNames}
            levels={levels}
            muted={muted}
            guitar={guitarIndex}
            onLevel={setLevel}
            onMute={toggleMute}
          />
        )}
        </div>
      </main>
      <TransportBar
        position={position}
        duration={song?.duration ?? 0}
        playing={playing}
        disabled={!song || busy}
        canRecord={!busy}
        onToggle={() => (playing ? engine().pause() : void engine().play())}
        onRewind={() => engine().seek(0)}
        speed={speed}
        preparing={preparing}
        onSpeed={changeSpeed}
        recording={recording}
        hasTake={song !== null}
        onRecord={toggleRecord}
        onExport={exportTake}
        onCalibrate={calibrate}
      />
    </div>
  );
}
