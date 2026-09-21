import { DEFAULT_CHOICE, inputConstraints } from "../lib/devices";
import type { AudioChoice } from "../lib/devices";
import recWorkletUrl from "./rec.worklet.ts?worker&url";

/** Records the microphone as raw PCM: echo cancellation, noise suppression and auto gain are off. */
export class Recorder {
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private blocks: Float32Array[] = [];

  /** A note for the user when the chosen input channel does not exist. */
  note = "";

  constructor(
    private ctx: AudioContext,
    private choice: AudioChoice = DEFAULT_CHOICE,
  ) {}

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: inputConstraints(this.choice) });
    await this.ctx.audioWorklet.addModule(recWorkletUrl);
    this.blocks = [];
    // One channel in, mixed down by Web Audio: "both inputs" of an interface are averaged to mono.
    this.node = new AudioWorkletNode(this.ctx, "take-capture", {
      numberOfOutputs: 0,
      channelCount: 1,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
    });
    this.node.port.onmessage = (e: MessageEvent<{ block?: Float32Array }>) => {
      if (e.data.block) this.blocks.push(e.data.block);
    };
    this.source = this.ctx.createMediaStreamSource(this.stream);
    // A two-input interface arrives as one stereo stream with the guitar on one side; pick that side out.
    const have = this.stream.getAudioTracks()[0]?.getSettings().channelCount ?? 2;
    const ch = this.choice.channel;
    this.note = "";
    if (ch >= 0 && ch < have) {
      const split = this.ctx.createChannelSplitter(2);
      this.source.connect(split);
      split.connect(this.node, ch, 0);
    } else {
      if (ch >= 0) this.note = `This input has one channel, so there is no Input ${ch + 1}; using the channel it has.`;
      this.source.connect(this.node);
    }
  }

  /** Stop and return the whole take. */
  async stop(): Promise<Float32Array> {
    const node = this.node;
    if (!node) return new Float32Array(0);
    const done = new Promise<void>((resolve) => {
      const prev = node.port.onmessage;
      node.port.onmessage = (e: MessageEvent<{ done?: number }>) => {
        prev?.call(node.port, e as MessageEvent);
        if (e.data.done !== undefined) resolve();
      };
    });
    node.port.postMessage({ stop: true });
    await done;
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.node = this.source = this.stream = null;
    const out = new Float32Array(this.blocks.reduce((n, b) => n + b.length, 0));
    let o = 0;
    for (const b of this.blocks) {
      out.set(b, o);
      o += b.length;
    }
    this.blocks = [];
    return out;
  }
}
