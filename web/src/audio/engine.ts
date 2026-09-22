import bandWorkletUrl from "./band.worklet.ts?worker&url";
import { measureLatency } from "./take";
import { DEFAULT_CHOICE, inputConstraints } from "../lib/devices";
import type { AudioChoice } from "../lib/devices";
import { Recorder } from "./recorder";
import { stretchChannels } from "./stretch";
import type { Stem } from "../types";
import type { BandCommand, BandEvent } from "./band.worklet";

export class Engine {
  private ctx = new AudioContext({ latencyHint: "interactive" });
  private node: AudioWorkletNode | null = null;

  private source: Stem[] = [];
  private speed = 1;
  private semitones = 0;
  private gains: { level: number; muted: boolean }[] = [];
  private loopSec: [number, number] | null = null;
  private lastFrame = 0;
  private playing = false;
  /** One rendering made ahead of time (progressive tempo), swapped in without waiting. */
  private prepared: { speed: number; semitones: number; stems: Stem[]; source: Stem[] } | null = null;
  private preparing: Promise<void> | null = null;
  private monitorNodes: { stream: MediaStream; source: MediaStreamAudioSourceNode; gain: GainNode } | null = null;

  /** Position is always reported in source-song seconds, whatever the speed. */
  onPosition: (seconds: number, playing: boolean, countingIn: boolean) => void = () => {};
  /** The loop wrapped: `wraps` passes since the loop was set. */
  onWrap: (wraps: number) => void = () => {};

  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  async init(): Promise<void> {
    if (this.node) return;
    await this.ctx.audioWorklet.addModule(bandWorkletUrl);
    const node = new AudioWorkletNode(this.ctx, "band-processor", { outputChannelCount: [2] });
    node.connect(this.ctx.destination);
    node.port.onmessage = (e: MessageEvent<BandEvent>) => {
      if (e.data.type === "wrap") {
        this.onWrap(e.data.wraps);
        return;
      }
      this.lastFrame = e.data.frame;
      this.playing = e.data.playing;
      this.onPosition((e.data.frame / this.ctx.sampleRate) * this.speed, e.data.playing, e.data.countingIn);
    };
    this.node = node;
  }

  /** Decode an audio file at the context's sample rate. Format support is the browser's. */
  async decode(file: File): Promise<Float32Array[]> {
    let buffer: AudioBuffer;
    try {
      buffer = await this.ctx.decodeAudioData(await file.arrayBuffer());
    } catch {
      throw new Error(`Could not read "${file.name}". Try a WAV, MP3, FLAC or M4A file.`);
    }
    return Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c).slice());
  }

  /** Hand the song's stems to the worklet, every stem at full gain. The engine posts copies, so the caller keeps its arrays. */
  load(stems: Stem[]): void {
    this.source = stems;
    this.speed = 1;
    this.semitones = 0;
    this.prepared = null;
    this.gains = stems.map(() => ({ level: 1, muted: false }));
    this.post(stems);
  }

  /** Re-render every stem at `speed` (0.25..1.25) and swap it in, keeping position, loop, gains and play state. */
  async setSpeed(speed: number): Promise<void> {
    if (speed === this.speed || this.source.length === 0) return;
    await this.render(speed, this.semitones);
  }

  /** Re-render every stem `semitones` higher (or lower) at the same speed. */
  async setTranspose(semitones: number): Promise<void> {
    if (semitones === this.semitones || this.source.length === 0) return;
    await this.render(this.speed, semitones);
  }

  get transpose(): number {
    return this.semitones;
  }

  /** Render `speed` in the background so the next `setSpeed(speed)` swaps it in at once. */
  prepare(speed: number): Promise<void> {
    if (this.source.length === 0 || speed === this.speed) return Promise.resolve();
    if (this.prepared?.speed === speed && this.prepared.semitones === this.semitones && this.prepared.source === this.source) return Promise.resolve();
    const source = this.source;
    const semitones = this.semitones;
    this.preparing = this.renderStems(source, speed, semitones)
      .then((stems) => {
        if (this.source === source) this.prepared = { speed, semitones, stems, source };
      })
      .catch(() => {})
      .finally(() => {
        this.preparing = null;
      });
    return this.preparing;
  }

  /** Add a part (an overdub take) on top of what is loaded, keeping position, loop, gains and speed. */
  addStem(stem: Stem): Promise<void> {
    return this.addStems([stem]);
  }

  /** Add several parts at once (the passes of a looped take), with one re-render. */
  async addStems(stems: Stem[]): Promise<void> {
    if (stems.length === 0) return;
    this.source = [...this.source, ...stems];
    for (const _ of stems) this.gains.push({ level: 1, muted: false });
    await this.render(this.speed, this.semitones);
  }

  /** Drop a part by index, keeping everything else. */
  async removeStem(index: number): Promise<void> {
    if (index < 0 || index >= this.source.length) return;
    this.source = this.source.filter((_, k) => k !== index);
    this.gains.splice(index, 1);
    await this.render(this.speed, this.semitones);
  }

  private renderStems(source: Stem[], speed: number, semitones: number): Promise<Stem[]> {
    return Promise.all(
      source.map(async (s) => ({ name: s.name, channels: await stretchChannels(s.channels, speed, this.ctx.sampleRate, semitones) })),
    );
  }

  private async render(speed: number, semitones: number): Promise<void> {
    const wasPlaying = this.playing;
    const at = (this.lastFrame / this.ctx.sampleRate) * this.speed;
    if (this.preparing) await this.preparing;
    const ready = this.prepared;
    const stretched =
      ready && ready.speed === speed && ready.semitones === semitones && ready.source === this.source
        ? ready.stems
        : await this.renderStems(this.source, speed, semitones);
    this.prepared = null;
    this.pause();
    this.speed = speed;
    this.semitones = semitones;
    this.post(stretched);
    this.gains.forEach((g, i) => this.send({ type: "gain", stem: i, level: g.level, muted: g.muted }));
    if (this.loopSec) this.setLoop(...this.loopSec);
    this.seek(at);
    if (wasPlaying) await this.play();
  }

  private post(stems: Stem[]): void {
    const copies = stems.map((s) => ({ name: s.name, channels: s.channels.map((c) => c.slice()) }));
    this.send({ type: "load", stems: copies }, copies.flatMap((s) => s.channels.map((c) => c.buffer)));
  }

  /** Set one stem's level (0..1) and mute. The worklet glides there in about 10 ms. */
  setStemGain(stem: number, level: number, muted: boolean): void {
    this.gains[stem] = { level, muted };
    this.send({ type: "gain", stem, level, muted });
  }

  /** Play a click through the speakers, record it on the mic, and return the round-trip latency in frames (0 if not heard). */
  async calibrate(): Promise<number> {
    await this.ctx.resume();
    const rec = this.recorder();
    await rec.start();
    const started = this.ctx.currentTime;
    const at = started + 0.5;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.frequency.value = 1000;
    env.gain.setValueAtTime(0.8, at);
    env.gain.exponentialRampToValueAtTime(0.001, at + 0.02);
    osc.connect(env).connect(this.ctx.destination);
    osc.start(at);
    osc.stop(at + 0.03);
    await new Promise((r) => setTimeout(r, 1200));
    const heard = await rec.stop();
    return measureLatency(heard, Math.round((at - started) * this.ctx.sampleRate));
  }

  /** Input device and channel for takes and calibration. */
  choice: AudioChoice = DEFAULT_CHOICE;

  recorder(): Recorder {
    return new Recorder(this.ctx, this.choice);
  }

  /** True when the browser can send sound to a chosen output (Chrome and Edge). */
  get canPickOutput(): boolean {
    return "setSinkId" in AudioContext.prototype;
  }

  /** Play through a chosen output, e.g. a USB headphone amp. Empty string is the system default. */
  async setOutput(deviceId: string): Promise<void> {
    const ctx = this.ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    await ctx.setSinkId?.(deviceId);
  }

  async play(): Promise<void> {
    await this.ctx.resume();
    this.send({ type: "play" });
  }

  /** Play after `beats` ticks at the song's tempo (heard at the current speed). */
  async playWithCountIn(beats: number, bpm: number): Promise<void> {
    const beatFrames = Math.round(((60 / bpm) * this.ctx.sampleRate) / this.speed);
    this.send({ type: "countIn", beats, beatFrames });
    await this.play();
  }

  /** Hear the chosen input through the output (software monitoring). Use headphones. */
  async monitor(on: boolean, level = 0.8): Promise<void> {
    if (!on) {
      const m = this.monitorNodes;
      if (!m) return;
      m.source.disconnect();
      m.gain.disconnect();
      m.stream.getTracks().forEach((t) => t.stop());
      this.monitorNodes = null;
      return;
    }
    if (this.monitorNodes) {
      this.monitorNodes.gain.gain.value = level;
      return;
    }
    await this.ctx.resume();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: inputConstraints(this.choice) });
    const source = this.ctx.createMediaStreamSource(stream);
    const gain = this.ctx.createGain();
    gain.gain.value = level;
    source.connect(gain).connect(this.ctx.destination);
    this.monitorNodes = { stream, source, gain };
  }

  get monitoring(): boolean {
    return this.monitorNodes !== null;
  }

  /** The browser's own input-to-output delay in milliseconds, as far as it reports it. */
  get reportedLatencyMs(): number {
    const ctx = this.ctx as AudioContext & { outputLatency?: number };
    return Math.round(((ctx.baseLatency ?? 0) + (ctx.outputLatency ?? 0)) * 1000);
  }

  /** A short reference tone, e.g. for tuning. Returns a function that stops it. */
  tone(hz: number, seconds = 2): () => void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    const now = this.ctx.currentTime;
    osc.type = "triangle";
    osc.frequency.value = hz;
    env.gain.setValueAtTime(0.25, now);
    env.gain.setTargetAtTime(0, now + seconds - 0.2, 0.05);
    osc.connect(env).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + seconds);
    return () => {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    };
  }

  /** The raw AudioContext, for panels that build their own small graphs (the tuner). */
  get context(): AudioContext {
    return this.ctx;
  }

  pause(): void {
    this.send({ type: "pause" });
  }

  seek(seconds: number): void {
    this.send({ type: "seek", frame: (seconds / this.speed) * this.ctx.sampleRate });
  }

  /** Loop between two times in seconds. The worklet wraps sample-accurately. */
  setLoop(startSec: number, endSec: number): void {
    const sr = this.ctx.sampleRate;
    this.loopSec = [startSec, endSec];
    this.send({ type: "loop", start: Math.round((startSec / this.speed) * sr), end: Math.round((endSec / this.speed) * sr) });
  }

  clearLoop(): void {
    this.loopSec = null;
    this.send({ type: "loopOff" });
  }

  private send(cmd: BandCommand, transfer: Transferable[] = []): void {
    this.node?.port.postMessage(cmd, transfer);
  }
}
