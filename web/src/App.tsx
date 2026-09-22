import { useCallback, useEffect, useRef, useState } from "react";
import { Engine } from "./audio/engine";
import { alignTake, encodeWav, mixParts, placeTake } from "./audio/take";
import type { Recorder } from "./audio/recorder";
import { analyseSong, chordsFor, QUICK_PARTS, quickSplit } from "./audio/analysis";
import { sumMono, waveLayers } from "./audio/mono";
import { computePeaks } from "./audio/peaks";
import { stretchChannels } from "./audio/stretch";
import { fetchStem, separate, serverAvailable } from "./data/server";
import { deleteTake as forgetTake, loadTakes, replaceTakes, saveTake } from "./data/takes";
import { loadLoops, saveLoops, upsertLoop } from "./data/loops";
import type { SavedLoop } from "./data/loops";
import { forgetSong, listSongs, rememberSong } from "./data/songs";
import type { SongEntry } from "./data/songs";
import { buildProject, isProjectFile, parseProject } from "./data/project";
import { isSilent, splitterHelp } from "./lib/band";
import { isLocalApp, quitLocalApp } from "./lib/local";
import { DEMO_SONGS, demoSections, GUITAR_STEM, synthDemoStems } from "./data/demo";
import { barLabel, beatsPerBar, snapLoopToBars } from "./lib/grid";
import { makeClick } from "./lib/songtools";
import { loopName, setIn, setOut } from "./lib/loop";
import type { LoopRange } from "./lib/loop";
import { splitPasses } from "./lib/passes";
import { DEFAULT_PROGRESSIVE, speedAfter } from "./lib/progressive";
import type { Progressive } from "./lib/progressive";
import { isTake, onlyTake, renumberTakes } from "./lib/takes";
import { inputConstraints } from "./lib/devices";
import { writeZip } from "./lib/zip";
import type { Section, SongInfo, Stem } from "./types";
import { BandMixer } from "./ui/BandMixer";
import { Header } from "./ui/Header";
import { LoopPanel } from "./ui/LoopPanel";
import { SongPanel } from "./ui/SongPanel";
import { AudioDevices } from "./ui/AudioDevices";
import { loadChoice, saveChoice } from "./lib/devices";
import type { AudioChoice } from "./lib/devices";
import { SongTools } from "./ui/SongTools";
import { TransportBar } from "./ui/TransportBar";
import { Tuner } from "./ui/Tuner";

const PEAK_BUCKETS = 4096;

type Meta = Pick<SongInfo, "bpm" | "timeSig" | "key"> & { downbeat?: number };
const UNKNOWN: Meta = { bpm: null, timeSig: null, key: null };
/** Which stored takes to bring back when a song opens. */
type Restore = "all" | "none" | "after-first";

function download(bytes: Uint8Array<ArrayBuffer>, name: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Linear resample, for takes from a project saved at another sample rate. */
function resampleTake(x: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return x;
  const step = from / to;
  const out = new Float32Array(Math.round(x.length / step));
  for (let i = 0; i < out.length; i++) {
    const p = i * step;
    const k = Math.floor(p);
    const a = x[k] ?? 0;
    const b = x[k + 1] ?? a;
    out[i] = a + (b - a) * (p - k);
  }
  return out;
}

export function App() {
  const engineRef = useRef<Engine | null>(null);
  const [song, setSong] = useState<SongInfo | null>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [countingIn, setCountingIn] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);
  const [loop, setLoop] = useState<LoopRange | null>(null);
  const [looping, setLooping] = useState(false);
  const [status, setStatus] = useState("");
  const [stemNames, setStemNames] = useState<string[]>([]);
  const [levels, setLevels] = useState<number[]>([]);
  const [muted, setMuted] = useState<boolean[]>([]);
  const [solo, setSolo] = useState<number | null>(null);
  const monoRef = useRef<Float32Array | null>(null);
  const layersRef = useRef<{ band: Float32Array; guitar: Float32Array | null } | null>(null);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(1);
  speedRef.current = speed;
  const [transpose, setTranspose] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [recording, setRecording] = useState(false);
  /** The local app was told to quit: nothing on this page works any more. */
  const [stopped, setStopped] = useState(false);
  const stemsRef = useRef<Stem[]>([]);
  const fileRef = useRef<File | null>(null);
  const [choice, setChoice] = useState<AudioChoice>(loadChoice);
  const takeCountRef = useRef(0);
  const recordFromRef = useRef(0);
  const recordSpeedRef = useRef(1);
  const recordLoopRef = useRef<LoopRange | null>(null);
  const recordCountInRef = useRef(0);
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
  const [savedLoops, setSavedLoops] = useState<SavedLoop[]>([]);
  const [countIn, setCountIn] = useState(false);
  const [progressive, setProgressive] = useState<Progressive>(DEFAULT_PROGRESSIVE);
  const [passes, setPasses] = useState(0);
  const [chords, setChords] = useState<Int32Array | null>(null);
  const [recent, setRecent] = useState<SongEntry[]>([]);
  const [monitoring, setMonitoring] = useState(false);

  // The AudioContext is created on the first click, which browsers require.
  function engine(): Engine {
    if (!engineRef.current) {
      const e = new Engine();
      e.choice = choice;
      e.onPosition = (s, p, c) => {
        setPosition(s);
        setPlaying(p);
        setCountingIn(c);
      };
      e.onWrap = (w) => setPasses(w);
      engineRef.current = e;
    }
    return engineRef.current;
  }

  const refreshRecent = () => void listSongs().then(setRecent);
  useEffect(refreshRecent, []);

  // Push the loop to the audio thread whenever it changes. A new loop starts the pass count over.
  useEffect(() => {
    setPasses(0);
    const e = engineRef.current;
    if (!e) return;
    if (loop && looping) e.setLoop(loop.start, loop.end);
    else e.clearLoop();
  }, [loop, looping]);

  // Progressive tempo: the loop wrapped, so maybe step the speed up, and get the step after ready.
  useEffect(() => {
    if (!progressive.on || !looping || !loop) return;
    const target = speedAfter(progressive, passes) / 100;
    if (target !== speedRef.current) void changeSpeed(target);
    const following = speedAfter(progressive, passes + progressive.every) / 100;
    if (following !== target) void engine().prepare(following);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passes, progressive, looping]);

  // Looping off ends the ramp.
  useEffect(() => {
    if (!looping && progressive.on) setProgressive({ ...progressive, on: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [looping]);

  // Chords follow the bar grid: whenever the tempo, bar 1, the time signature or the audio changes.
  const bpb = beatsPerBar(song?.timeSig ?? null);
  useEffect(() => {
    const mono = monoRef.current;
    if (!song?.bpm || !bpb || !mono || !engineRef.current) {
      setChords(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      chordsFor(mono, engineRef.current!.sampleRate, song.bpm!, song.downbeat ?? 0, bpb)
        .then((c) => {
          if (!cancelled) setChords(c);
        })
        .catch(() => {});
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.name, song?.bpm, song?.downbeat, bpb, peaks]);

  const announceLoop = (l: LoopRange) =>
    setStatus(`Loop set: ${song?.bpm && bpb ? barLabel(l.start, l.end, song.bpm, bpb, song.downbeat ?? 0) : loopName(l, null, null).replace("Loop, ", "")}`);
  function editLoop(l: LoopRange, announce = true) {
    setLoop(l);
    if (announce) announceLoop(l);
  }

  /** Rebuild the waveform layers and overview from the current parts. */
  async function refreshViews(stems: Stem[]) {
    stemsRef.current = stems;
    const { band, guitar, mono } = waveLayers(stems, GUITAR_STEM);
    layersRef.current = { band, guitar };
    monoRef.current = mono;
    setPeaks(await computePeaks(mono.slice(), PEAK_BUCKETS));
  }

  function setParts(stems: Stem[], mutedList?: boolean[]) {
    setStemNames(stems.map((s) => s.name));
    setLevels(stems.map(() => 100));
    setMuted(mutedList ?? stems.map(() => false));
    setSolo(null);
  }

  async function open(
    name: string,
    getStems: (e: Engine) => Promise<Stem[]>,
    meta: Meta,
    songSections: Section[] = [],
    restore: Restore = "all",
    entry?: Omit<SongEntry, "name" | "when">,
  ): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const e = engine();
      await e.init();
      e.pause();
      const stems = await getStems(e);
      // Takes recorded over this song earlier come back as parts.
      const stored = restore === "none" ? [] : await loadTakes(name);
      const saved = restore === "after-first" ? stored.slice(1) : stored;
      const firstNumber = restore === "after-first" ? 2 : 1;
      takeCountRef.current = restore === "after-first" ? stored.length : saved.length;
      const length = stems[0].channels[0].length;
      saved.forEach((t, k) => stems.push({ name: `Take ${k + firstNumber}`, channels: [placeTake(t, 0, length)] }));
      e.load(stems);
      await refreshViews(stems);
      const info: SongInfo = { name, duration: stems[0].channels[0].length / e.sampleRate, ...meta, stemCount: stems.length, fullMix: stems.some((st) => st.name === "Full mix") };
      setSong(info);
      if (meta.bpm === null && monoRef.current) {
        // Estimate tempo, first beat and key in the background; 4/4 is assumed.
        void analyseSong(monoRef.current, e.sampleRate)
          .then((a) =>
            setSong((cur) =>
              cur && cur.name === name && cur.bpm === null
                ? { ...cur, bpm: a.bpm, timeSig: a.bpm ? "4/4" : null, key: a.key, downbeat: a.firstBeat, estimated: true }
                : cur,
            ),
          )
          .catch(() => {});
      }
      setParts(stems);
      setSections(songSections);
      setSpeed(1);
      setTranspose(0);
      setLoop(null);
      setLooping(false);
      setProgressive(DEFAULT_PROGRESSIVE);
      setStatus("");
      setPosition(0);
      setPlaying(false);
      setSavedLoops(await loadLoops(name));
      if (entry) {
        await rememberSong({ name, when: Date.now(), ...entry });
        refreshRecent();
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong loading that recording.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const openFile = (file: File) => {
    if (isProjectFile(file)) return openProject(file);
    fileRef.current = file;
    return openFileParts(file, "all", { kind: "file", blob: file });
  };
  const openFileParts = (file: File, restore: Restore = "all", entry?: Omit<SongEntry, "name" | "when">) =>
    open(
      file.name,
      async (e) => {
        // With the local backend running, split the recording into parts; otherwise it stays one "Full mix".
        if (await serverAvailable()) {
          try {
            setStatus("Splitting into instruments on this computer. A few seconds per minute of music on a recent Mac; much longer without a GPU.");
            const result = await separate(file);
            return await Promise.all(
              result.stems.map(async (n) => ({ name: n.replace(/\.wav$/, ""), channels: await e.decode(await fetchStem(result.hash, n)) })),
            );
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not split that recording.");
          }
        }
        return [{ name: "Full mix", channels: await e.decode(file) }];
      },
      UNKNOWN,
      [],
      restore,
      entry,
    );
  const openDemo = (name: string) => {
    const demo = DEMO_SONGS.find((d) => d.name === name) ?? DEMO_SONGS[0];
    fileRef.current = null;
    return open(demo.name, async (e) => synthDemoStems(e.sampleRate, demo.bars, demo), { bpm: demo.bpm, timeSig: demo.timeSig, key: demo.key }, demoSections(demo), "all", { kind: "demo" });
  };
  /** A song that started from a take: Take 1 is the song, the rest are overdubs. */
  const openRecording = async (name: string) => {
    const takes = await loadTakes(name);
    if (takes.length === 0) {
      setError(`No takes are saved for "${name}" in this browser.`);
      return false;
    }
    fileRef.current = null;
    return open(name, async () => [{ name: "Take 1", channels: [takes[0]] }], UNKNOWN, [], "after-first", { kind: "recording" });
  };
  const openRecent = (entry: SongEntry) => {
    if (entry.kind === "demo") return openDemo(entry.name);
    if (entry.kind === "recording") return openRecording(entry.name);
    if (entry.blob) return openFile(new File([entry.blob], entry.name, { type: entry.blob.type }));
    return Promise.resolve(false);
  };
  const forgetRecent = async (entry: SongEntry) => {
    await forgetSong(entry.name);
    refreshRecent();
  };

  // Levels live here and reach the audio thread the moment they change.
  // Mute and solo together decide what is silent; push every part so the audio always matches.
  function pushGains(nextLevels: number[], nextMuted: boolean[], nextSolo: number | null) {
    nextLevels.forEach((lv, k) => engine().setStemGain(k, lv / 100, isSilent(k, nextMuted, nextSolo)));
  }
  function setLevel(i: number, level: number) {
    const next = levels.map((v, k) => (k === i ? level : v));
    setLevels(next);
    engine().setStemGain(i, level / 100, isSilent(i, muted, solo));
  }
  function toggleMute(i: number) {
    const next = muted.map((v, k) => (k === i ? !v : v));
    setMuted(next);
    pushGains(levels, next, solo);
  }
  function toggleSolo(i: number) {
    const next = solo === i ? null : i;
    setSolo(next);
    pushGains(levels, muted, next);
    setStatus(next === null ? "Solo off: hearing every part again." : `Solo: hearing only ${stemNames[i]}. Slow it down with the tempo slider to pick the part out.`);
  }
  function hearOnlyTake(i: number) {
    const next = onlyTake(stemNames, muted, i);
    setMuted(next);
    pushGains(levels, next, solo);
    setStatus(`Hearing ${stemNames[i]} with the band; the other takes are muted.`);
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

  async function changeTranspose(semitones: number) {
    setPreparing(true);
    setTranspose(semitones);
    try {
      await engine().setTranspose(semitones);
    } catch {
      setError("Could not transpose.");
    } finally {
      setPreparing(false);
    }
  }

  function changeProgressive(p: Progressive) {
    setProgressive(p);
    if (p.on && !progressive.on) {
      setPasses(0);
      void changeSpeed(p.from / 100);
      setStatus(`Progressive tempo on: ${p.from}% now, +${p.step}% every ${p.every} pass${p.every === 1 ? "" : "es"}, up to ${p.to}%.`);
    }
  }

  /** Play, with a bar of count-in first when that is on and the tempo is known. */
  async function startPlaying() {
    const e = engine();
    if (countIn && song?.bpm && bpb) await e.playWithCountIn(bpb, song.bpm);
    else await e.play();
  }

  // Each take becomes another part in the mixer, so you can keep recording on top (overdub).
  async function toggleRecord() {
    try {
      const e = engine();
      await e.init();
      if (!recording) {
        const r = e.recorder();
        await r.start();
        recorderRef.current = r;
        recordFromRef.current = song ? position : 0;
        recordSpeedRef.current = speed;
        recordLoopRef.current = song && looping && loop ? loop : null;
        recordCountInRef.current = song && countIn && song.bpm && bpb ? Math.round((((60 / song.bpm) * bpb) / speed) * e.sampleRate) : 0;
        setRecording(true);
        if (song) await startPlaying();
        return;
      }
      e.pause();
      const raw = await recorderRef.current!.stop();
      setRecording(false);
      // Drop the count-in, line up with the band, and bring a slowed-down take back to song time.
      let aligned = alignTake(raw, latency + recordCountInRef.current);
      if (aligned.length === 0) return;
      const spd = recordSpeedRef.current;
      if (spd !== 1) aligned = (await stretchChannels([aligned], 1 / spd, e.sampleRate))[0];
      if (!song) {
        // Nothing loaded: this take is the song, and the next takes go on top of it.
        await open("My recording", async () => [{ name: "Take 1", channels: [aligned] }], UNKNOWN, [], "none", { kind: "recording" });
        takeCountRef.current = 1;
        void saveTake("take:My recording:1", aligned);
        setStatus("Take 1 recorded. Press Record again to overdub. Use headphones so the band is not re-recorded.");
        return;
      }
      const length = stemsRef.current[0].channels[0].length;
      const sr = e.sampleRate;
      const rl = recordLoopRef.current;
      let placedTakes: Float32Array[];
      if (rl) {
        // Recorded over a loop: every complete pass is its own take, all placed at the loop start.
        const cut = splitPasses(aligned, (recordFromRef.current - rl.start) * sr, (rl.end - rl.start) * sr);
        placedTakes = cut.map((p) => placeTake(p.samples, rl.start * sr, length));
      } else {
        placedTakes = [placeTake(aligned, recordFromRef.current * sr, length)];
      }
      const first = takeCountRef.current + 1;
      const added: Stem[] = placedTakes.map((t, k) => ({ name: `Take ${first + k}`, channels: [t] }));
      await e.addStems(added);
      e.seek(rl ? rl.start : recordFromRef.current);
      takeCountRef.current = first + added.length - 1;
      for (const [k, t] of placedTakes.entries()) void saveTake(`take:${song.name}:${first + k}`, t);
      await refreshViews([...stemsRef.current, ...added]);
      // Every pass but the last starts muted, so the loop plays back with one take at a time.
      const newMuted = added.map((_, k) => k < added.length - 1);
      const nextNames = [...stemNames, ...added.map((s) => s.name)];
      const nextLevels = [...levels, ...added.map(() => 100)];
      const nextMuted = [...muted, ...newMuted];
      setStemNames(nextNames);
      setLevels(nextLevels);
      setMuted(nextMuted);
      pushGains(nextLevels, nextMuted, solo);
      setSong({ ...song, stemCount: song.stemCount + added.length });
      const speedNote = spd !== 1 ? ` Recorded at ${Math.round(spd * 100)}% and brought back to full speed.` : "";
      setStatus(
        added.length > 1
          ? `${added.length} passes recorded as Takes ${first} to ${first + added.length - 1}; the last one is playing, the others are muted. Use "Only this take" to compare.${speedNote}`
          : `Take ${first} recorded as a new part. Press Record again to overdub.${speedNote}`,
      );
    } catch {
      setRecording(false);
      setError("Could not use the microphone. Allow access and try again.");
    }
  }

  async function deleteTake(i: number) {
    if (!song) return;
    const name = stemNames[i];
    const m = name.match(/^Take (\d+)$/);
    if (!m) return;
    const e = engine();
    await e.removeStem(i);
    const stems = stemsRef.current.filter((_, k) => k !== i);
    const names = renumberTakes(stemNames, i);
    const renamed = stems.map((s, k) => ({ ...s, name: names[k] }));
    await refreshViews(renamed);
    const nextLevels = levels.filter((_, k) => k !== i);
    const nextMuted = muted.filter((_, k) => k !== i);
    const nextSolo = solo === null ? null : solo === i ? null : solo > i ? solo - 1 : solo;
    setStemNames(names);
    setLevels(nextLevels);
    setMuted(nextMuted);
    setSolo(nextSolo);
    pushGains(nextLevels, nextMuted, nextSolo);
    takeCountRef.current = Math.max(0, takeCountRef.current - 1);
    await forgetTake(song.name, Number(m[1]));
    setSong({ ...song, stemCount: song.stemCount - 1 });
    setStatus(`${name} deleted.`);
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

  /** Swap in a new set of parts for the current song, back at full level and 100% speed. */
  async function replaceStems(stems: Stem[]) {
    const e = engine();
    const at = position;
    e.pause();
    e.load(stems);
    e.seek(at);
    await refreshViews(stems);
    setParts(stems);
    setSpeed(1);
    setTranspose(0);
    setSong((cur) => (cur ? { ...cur, stemCount: stems.length, fullMix: stems.some((st) => st.name === "Full mix") } : cur));
  }

  async function splitParts() {
    const stems = stemsRef.current;
    const i = stems.findIndex((s) => s.name === "Full mix");
    if (i < 0) return;
    setBusy(true);
    setStatus("Splitting into parts…");
    try {
      const parts = await quickSplit(sumMono([stems[i].channels]), engine().sampleRate);
      const made = parts.map((p, k) => ({ name: QUICK_PARTS[k], channels: [p] }));
      await replaceStems([...stems.slice(0, i), ...made, ...stems.slice(i + 1)]);
      setStatus("Split into three parts. They add back up to the original; mute or turn down what you do not want.");
    } catch {
      setError("Could not split that recording.");
    } finally {
      setBusy(false);
    }
  }

  /** Real instrument stems need the local backend; say so right here if it is not running. */
  async function splitInstruments() {
    const file = fileRef.current;
    if (!file) {
      setStatus("Instrument split works on a loaded recording, not on takes.");
      return;
    }
    if (!(await serverAvailable())) {
      setStatus(splitterHelp(isLocalApp()));
      return;
    }
    await openFileParts(file);
  }

  async function changeDevices(next: AudioChoice) {
    setChoice(next);
    saveChoice(next);
    const e = engine();
    e.choice = next;
    if (next.output !== choice.output) {
      try {
        await e.setOutput(next.output);
      } catch {
        setError("Could not switch to that output.");
      }
    }
    if (monitoring) {
      await e.monitor(false);
      await e.monitor(true).catch(() => setMonitoring(false));
    }
  }

  /** Open the input once so the browser will reveal device names, then let it go. */
  async function allowInput() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch {
      setError("Could not use the microphone. Allow access and try again.");
    }
  }

  async function toggleMonitor(on: boolean) {
    try {
      const e = engine();
      await e.init();
      await e.monitor(on);
      setMonitoring(on);
      setStatus(on ? `Monitor on: you hear your input through the app, about ${e.reportedLatencyMs} ms late. Use headphones.` : "Monitor off.");
    } catch {
      setMonitoring(false);
      setError("Could not use the microphone. Allow access and try again.");
    }
  }

  const listenForTuner = useCallback(async () => {
    try {
      const e = engine();
      await e.init();
      await e.context.resume();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: inputConstraints(e.choice) });
      const source = e.context.createMediaStreamSource(stream);
      const analyser = e.context.createAnalyser();
      analyser.fftSize = 4096;
      source.connect(analyser);
      return {
        analyser,
        sampleRate: e.sampleRate,
        stop: () => {
          source.disconnect();
          stream.getTracks().forEach((t) => t.stop());
        },
      };
    } catch {
      setError("Could not use the microphone. Allow access and try again.");
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addClick() {
    if (!song?.bpm || !bpb) return;
    const stems = stemsRef.current;
    const click = makeClick(song.bpm, bpb, song.downbeat ?? 0, stems[0].channels[0].length, engine().sampleRate);
    const stem: Stem = { name: "Click", channels: [click] };
    await engine().addStem(stem);
    await refreshViews([...stems, stem]);
    setStemNames((p) => [...p, stem.name]);
    setLevels((p) => [...p, 100]);
    setMuted((p) => [...p, false]);
    setSong({ ...song, stemCount: song.stemCount + 1 });
    setStatus("Click track added as a part. Mute it before you export.");
  }

  /** A new tempo, time signature or bar 1. An existing click track is rebuilt to match. */
  async function retune(next: SongInfo) {
    setSong(next);
    const stems = stemsRef.current;
    const ci = stems.findIndex((s) => s.name === "Click");
    if (ci >= 0 && next.bpm) {
      const click = makeClick(next.bpm, beatsPerBar(next.timeSig) ?? 4, next.downbeat ?? 0, stems[0].channels[0].length, engine().sampleRate);
      await replaceStems(stems.map((s, k) => (k === ci ? { name: "Click", channels: [click] } : s)));
    }
  }
  const changeBpm = (bpm: number) => song && retune({ ...song, bpm, timeSig: song.timeSig ?? "4/4" });
  const changeTimeSig = (timeSig: string) => song && retune({ ...song, timeSig });
  const barOneHere = () => song && retune({ ...song, downbeat: Math.max(0, position) });
  const nudgeDownbeat = (d: number) => song && retune({ ...song, downbeat: Math.max(0, (song.downbeat ?? 0) + d) });

  function saveLoop(name: string) {
    if (!song || !loop) return;
    const next = upsertLoop(savedLoops, { name, start: loop.start, end: loop.end });
    setSavedLoops(next);
    void saveLoops(song.name, next);
    setStatus(`Loop "${name}" saved.`);
  }
  function deleteLoop(name: string) {
    if (!song) return;
    const next = savedLoops.filter((l) => l.name !== name);
    setSavedLoops(next);
    void saveLoops(song.name, next);
  }
  function pickLoop(l: SavedLoop) {
    editLoop({ start: l.start, end: l.end });
    engine().seek(l.start);
  }

  /** Export what you hear: every part at its level, muted parts left out. */
  function exportTake() {
    const stems = stemsRef.current;
    if (stems.length === 0) return;
    const parts = stems.map((st) => sumMono([st.channels]));
    const gains = stems.map((_, k) => (isSilent(k, muted, solo) ? 0 : (levels[k] ?? 100) / 100));
    download(encodeWav(mixParts(parts, gains), engine().sampleRate), "mix.wav", "audio/wav");
  }

  /** One WAV per audible part, at its level, in a zip. */
  function exportParts() {
    const stems = stemsRef.current;
    if (stems.length === 0) return;
    const sr = engine().sampleRate;
    const entries = stems
      .map((st, k) => ({ st, k }))
      .filter(({ k }) => !isSilent(k, muted, solo))
      .map(({ st, k }) => {
        const gain = (levels[k] ?? 100) / 100;
        const mono = sumMono([st.channels]);
        if (gain !== 1) for (let i = 0; i < mono.length; i++) mono[i] *= gain;
        return { name: `${st.name.replace(/[^\w .-]+/g, "_")}.wav`, data: encodeWav(mono, sr) };
      });
    if (entries.length === 0) {
      setStatus("Every part is muted; nothing to export.");
      return;
    }
    download(writeZip(entries), `${(song?.name ?? "song").replace(/\.[^.]+$/, "")}-parts.zip`, "application/zip");
  }

  /** Everything about this song in one zip: the recording, takes, loops and mix. */
  async function saveProject() {
    if (!song) return;
    setBusy(true);
    try {
      const mix: Record<string, { level: number; muted: boolean }> = {};
      stemNames.forEach((n, k) => (mix[n] = { level: levels[k] ?? 100, muted: muted[k] ?? false }));
      const file = fileRef.current ? { name: fileRef.current.name, bytes: new Uint8Array(await fileRef.current.arrayBuffer()) } : null;
      const takes = stemsRef.current.filter((s) => isTake(s.name)).map((s) => s.channels[0]);
      const zip = buildProject(
        { version: 1, name: song.name, bpm: song.bpm, timeSig: song.timeSig, downbeat: song.downbeat ?? 0, key: song.key, transpose, loops: savedLoops, mix },
        file,
        takes,
        engine().sampleRate,
      );
      download(zip, `${song.name.replace(/\.[^.]+$/, "")}.gpitb.zip`, "application/zip");
      setStatus("Project saved. Load that zip to get the song, takes, loops and mix back.");
    } catch {
      setError("Could not save the project.");
    } finally {
      setBusy(false);
    }
  }

  async function openProject(file: File): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const p = parseProject(new Uint8Array(await file.arrayBuffer()));
      const e = engine();
      await e.init();
      const takes = p.takes.map((t) => resampleTake(t, p.sampleRate, e.sampleRate));
      await replaceTakes(p.meta.name, takes);
      let ok: boolean;
      if (p.file) {
        const f = new File([p.file], p.meta.name, { type: p.file.type });
        fileRef.current = f;
        ok = await openFileParts(f, "all", { kind: "file", blob: f });
      } else {
        ok = await openRecording(p.meta.name);
      }
      if (!ok) return false;
      const m = p.meta;
      const stems = stemsRef.current;
      setSong((cur) => (cur ? { ...cur, bpm: m.bpm ?? cur.bpm, timeSig: m.timeSig ?? cur.timeSig, downbeat: m.downbeat, key: m.key ?? cur.key, estimated: m.bpm ? false : cur.estimated } : cur));
      setSavedLoops(m.loops);
      void saveLoops(m.name, m.loops);
      const nextLevels = stems.map((s) => m.mix[s.name]?.level ?? 100);
      const nextMuted = stems.map((s) => m.mix[s.name]?.muted ?? false);
      setLevels(nextLevels);
      setMuted(nextMuted);
      pushGains(nextLevels, nextMuted, null);
      if (m.transpose !== 0) await changeTranspose(m.transpose);
      setStatus(`Project loaded: ${takes.length} take${takes.length === 1 ? "" : "s"}, ${m.loops.length} saved loop${m.loops.length === 1 ? "" : "s"}.`);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that project file.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const guitarIndex = stemNames.indexOf(GUITAR_STEM);
  const guitarLevel = guitarIndex >= 0 && !isSilent(guitarIndex, muted, solo) ? (levels[guitarIndex] ?? 100) / 100 : 0;

  const defaultLen = () => (song?.bpm && bpb ? (60 / song.bpm) * bpb : 4);

  async function quit() {
    engine().pause();
    if (await quitLocalApp()) setStopped(true);
    else setError("Could not reach the app to stop it. It stops by itself a couple of minutes after you close this tab.");
  }

  if (stopped) {
    return (
      <div className="app">
        <header className="header"><h1>Go Play in the Band</h1></header>
        <main className="main">
          <section className="panel" role="status">
            <h2>Stopped</h2>
            <p>The app and the instrument splitter have stopped. Your takes are saved. You can close this tab; open the app again to carry on.</p>
          </section>
        </main>
      </div>
    );
  }

  const sr = engineRef.current?.sampleRate ?? 48000;
  return (
    <div className="app">
      <Header
        song={song}
        busy={busy}
        onPickFile={(f) => void openFile(f)}
        demos={DEMO_SONGS.map((d) => d.name)}
        onLoadDemo={(n) => void openDemo(n)}
        onSaveProject={song ? () => void saveProject() : undefined}
        onQuit={isLocalApp() ? quit : undefined}
        recording={recording}
      />
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
          chords={chords && song?.bpm && bpb ? { indexes: chords, bpm: song.bpm, beatsPerBar: bpb, downbeat: song.downbeat ?? 0 } : null}
          recent={recent}
          onOpenRecent={(r) => void openRecent(r)}
          onForgetRecent={(r) => void forgetRecent(r)}
        />
        {song && (
          <LoopPanel
            duration={song.duration}
            position={position}
            loop={loop}
            looping={looping}
            bpm={song.bpm}
            downbeat={song.downbeat ?? 0}
            beatsPerBar={bpb}
            sampleRate={sr}
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
              const [start, end] = snapLoopToBars(loop.start, loop.end, song.bpm, bpb, song.duration, song.downbeat ?? 0);
              editLoop({ start, end });
            }}
            savedLoops={savedLoops}
            onSaveLoop={saveLoop}
            onDeleteLoop={deleteLoop}
            onPickLoop={pickLoop}
            countIn={countIn}
            onCountIn={setCountIn}
            progressive={progressive}
            onProgressive={changeProgressive}
            passes={passes}
            chords={chords}
          />
        )}
        {song && (
          <SongTools
            song={song}
            busy={busy || recording}
            speed={speed}
            hasClick={stemNames.includes("Click")}
            onBpm={(b) => void changeBpm(b)}
            onClick={() => void addClick()}
            onTimeSig={(t) => void changeTimeSig(t)}
            onBarOneHere={() => void barOneHere()}
            onNudgeDownbeat={(d) => void nudgeDownbeat(d)}
            transpose={transpose}
            onTranspose={(n) => void changeTranspose(n)}
          />
        )}
        <AudioDevices
          choice={choice}
          canPickOutput={"setSinkId" in AudioContext.prototype}
          disabled={recording}
          onChange={(c) => void changeDevices(c)}
          onAllow={allowInput}
          monitoring={monitoring}
          onMonitor={(on) => void toggleMonitor(on)}
          reportedLatencyMs={engineRef.current?.reportedLatencyMs ?? null}
          calibratedMs={latency ? Math.round((latency / sr) * 1000) : null}
        />
        <Tuner listen={listenForTuner} tone={(hz) => engine().tone(hz)} disabled={recording} />
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
            solo={solo}
            onSolo={toggleSolo}
            onQuickSplit={stemNames.includes("Full mix") ? () => void splitParts() : undefined}
            onStemSplit={() => void splitInstruments()}
            busy={busy || recording}
            onOnlyTake={hearOnlyTake}
            onDeleteTake={(i) => void deleteTake(i)}
          />
        )}
        </div>
      </main>
      <TransportBar
        position={position}
        duration={song?.duration ?? 0}
        playing={playing}
        countingIn={countingIn}
        disabled={!song || busy}
        canRecord={!busy}
        onToggle={() => (playing ? engine().pause() : void startPlaying())}
        onRewind={() => engine().seek(0)}
        speed={speed}
        preparing={preparing}
        onSpeed={changeSpeed}
        bpm={song?.bpm ?? null}
        recording={recording}
        hasTake={song !== null}
        onRecord={toggleRecord}
        onExport={exportTake}
        onExportParts={exportParts}
        onCalibrate={calibrate}
      />
    </div>
  );
}
