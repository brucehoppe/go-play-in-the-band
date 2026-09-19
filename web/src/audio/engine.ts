import bandWorkletUrl from "./band.worklet.ts?worker&url";
import type { BandCommand, BandEvent } from "./band.worklet";

export class Engine {
  private ctx = new AudioContext({ latencyHint: "interactive" });
  private node: AudioWorkletNode | null = null;

  onPosition: (seconds: number, playing: boolean) => void = () => {};

  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  async init(): Promise<void> {
    if (this.node) return;
    await this.ctx.audioWorklet.addModule(bandWorkletUrl);
    const node = new AudioWorkletNode(this.ctx, "band-processor", { outputChannelCount: [2] });
    node.connect(this.ctx.destination);
    node.port.onmessage = (e: MessageEvent<BandEvent>) =>
      this.onPosition(e.data.frame / this.ctx.sampleRate, e.data.playing);
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

  /** Hand the song to the worklet. The engine posts copies, so the caller keeps its arrays. */
  load(channels: Float32Array[]): void {
    const copies = channels.map((c) => c.slice());
    this.send({ type: "load", channels: copies }, copies.map((c) => c.buffer));
  }

  async play(): Promise<void> {
    await this.ctx.resume();
    this.send({ type: "play" });
  }

  pause(): void {
    this.send({ type: "pause" });
  }

  seek(seconds: number): void {
    this.send({ type: "seek", frame: seconds * this.ctx.sampleRate });
  }

  /** Loop between two times in seconds. The worklet wraps sample-accurately. */
  setLoop(startSec: number, endSec: number): void {
    const sr = this.ctx.sampleRate;
    this.send({ type: "loop", start: Math.round(startSec * sr), end: Math.round(endSec * sr) });
  }

  clearLoop(): void {
    this.send({ type: "loopOff" });
  }

  private send(cmd: BandCommand, transfer: Transferable[] = []): void {
    this.node?.port.postMessage(cmd, transfer);
  }
}
