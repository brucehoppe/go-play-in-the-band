import type { Stem } from "../types";
import { Mixer } from "./mixer";
import { Transport } from "./transport";

export type BandCommand =
  | { type: "load"; stems: Stem[] }
  | { type: "play" }
  | { type: "pause" }
  | { type: "seek"; frame: number }
  | { type: "loop"; start: number; end: number }
  | { type: "loopOff" }
  | { type: "gain"; stem: number; level: number; muted: boolean }
  | { type: "countIn"; beats: number; beatFrames: number };

export type BandEvent = { type: "position"; frame: number; playing: boolean; countingIn: boolean } | { type: "wrap"; wraps: number };

interface WorkletPort {
  onmessage: ((e: MessageEvent<BandCommand>) => void) | null;
  postMessage(message: BandEvent): void;
}
declare const AudioWorkletProcessor: { new (): { readonly port: WorkletPort } };
declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: new () => object): void;

/** Report the position about every 1024 frames (~21 ms at 48 kHz), and on every state change. */
const REPORT_EVERY = 1024;
/** Loop-wrap crossfade length, about 8 ms at 48 kHz. */
const FADE_FRAMES = 384;

class BandProcessor extends AudioWorkletProcessor {
  private transport = new Transport(0);
  private stems: Float32Array[][] = [[new Float32Array(0)]];
  private mixer = new Mixer(1, sampleRate);
  private sinceReport = 0;
  private lastPlaying = false;

  constructor() {
    super();
    this.port.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "load") {
        this.stems = msg.stems.map((s) => s.channels);
        this.mixer = new Mixer(this.stems.length, sampleRate);
        this.transport = new Transport(this.stems[0][0].length, FADE_FRAMES);
      } else if (msg.type === "play") this.transport.play();
      else if (msg.type === "pause") this.transport.pause();
      else if (msg.type === "seek") this.transport.seek(msg.frame);
      else if (msg.type === "loop") this.transport.setLoop(msg.start, msg.end);
      else if (msg.type === "loopOff") this.transport.clearLoop();
      else if (msg.type === "gain") this.mixer.setTarget(msg.stem, msg.level, msg.muted);
      else if (msg.type === "countIn") this.transport.countIn(msg.beats, msg.beatFrames);
      this.report();
    };
  }

  private report(): void {
    this.sinceReport = 0;
    this.lastPlaying = this.transport.playing;
    this.port.postMessage({ type: "position", frame: this.transport.position, playing: this.transport.playing, countingIn: this.transport.countingIn });
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const wraps = this.transport.wraps;
    this.transport.render(this.stems, out, this.mixer, sampleRate);
    if (this.transport.wraps !== wraps) this.port.postMessage({ type: "wrap", wraps: this.transport.wraps });
    this.sinceReport += out[0].length;
    if (this.sinceReport >= REPORT_EVERY || this.transport.playing !== this.lastPlaying) this.report();
    return true;
  }
}

registerProcessor("band-processor", BandProcessor);
