import bandWorkletUrl from "./band.worklet.ts?worker&url";
import { measureLatency } from "./take";
import { Recorder } from "./recorder";
import { stretchChannels } from "./stretch";
import type { Stem } from "../types";
import type { BandCommand, BandEvent } from "./band.worklet";

export class Engine {
  private ctx = new AudioContext({ latencyHint: "interactive" });
  private node: AudioWorkletNode | null = null;

  private source: Stem[] = [];
  private speed = 1;
  private gains: { level: number; muted: boolean }[] = [];
  private loopSec: [number, number] | null = null;
  private lastFrame = 0;
  private playing = false;

  /** Position is always reported in source-song seconds, whatever the speed. */
  onPosition: (seconds: number, playing: boolean) => void = () => {};

  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  async init(): Promise<void> {
    if (this.node) return;
    await this.ctx.audioWorklet.addModule(bandWorkletUrl);
    const node = new AudioWorkletNode(this.ctx, "band-processor", { outputChannelCount: [2] });
    node.connect(this.ctx.destination);
    node.port.onmessage = (e: MessageEvent<BandEvent>) => {
      this.lastFrame = e.data.frame;
      this.playing = e.data.playing;
      this.onPosition((e.data.frame / this.ctx.sampleRate) * this.speed, e.data.playing);
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
    this.gains = stems.map(() => ({ level: 1, muted: false }));
    this.post(stems);
  }

  /** Re-render every stem at `speed` (0.5..1) and swap it in, keeping position, loop, gains and play state. */
  async setSpeed(speed: number): Promise<void> {
    if (speed === this.speed || this.source.length === 0) return;
    const wasPlaying = this.playing;
    const at = (this.lastFrame / this.ctx.sampleRate) * this.speed;
    this.pause();
    const stretched = await Promise.all(
      this.source.map(async (s) => ({ name: s.name, channels: await stretchChannels(s.channels, speed, this.ctx.sampleRate) })),
    );
    this.speed = speed;
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

  recorder(): Recorder {
    return new Recorder(this.ctx);
  }

  async play(): Promise<void> {
    await this.ctx.resume();
    this.send({ type: "play" });
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
