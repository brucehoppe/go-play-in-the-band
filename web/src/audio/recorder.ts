import recWorkletUrl from "./rec.worklet.ts?worker&url";

/** Records the microphone as raw PCM: echo cancellation, noise suppression and auto gain are off. */
export class Recorder {
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private blocks: Float32Array[] = [];

  constructor(private ctx: AudioContext) {}

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    await this.ctx.audioWorklet.addModule(recWorkletUrl);
    this.blocks = [];
    this.node = new AudioWorkletNode(this.ctx, "take-capture", { numberOfOutputs: 0 });
    this.node.port.onmessage = (e: MessageEvent<{ block?: Float32Array }>) => {
      if (e.data.block) this.blocks.push(e.data.block);
    };
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.source.connect(this.node);
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
