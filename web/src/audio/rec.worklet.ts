/** Raw mono take capture on the audio thread. Ported from minor-pentatonic-go's rec-worklet.js. */
interface RecPort {
  onmessage: ((e: MessageEvent<{ stop?: boolean }>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}
declare const AudioWorkletProcessor: { new (): { readonly port: RecPort } };
declare function registerProcessor(name: string, ctor: new () => object): void;

const BLOCK = 24000;

class TakeCapture extends AudioWorkletProcessor {
  private buf = new Float32Array(BLOCK);
  private fill = 0;
  private frames = 0;
  private stopped = false;

  constructor() {
    super();
    this.port.onmessage = (e) => {
      if (e.data?.stop) this.stopped = true;
    };
  }

  private flush(): void {
    if (!this.fill) return;
    const block = this.buf.slice(0, this.fill);
    this.port.postMessage({ block }, [block.buffer]);
    this.frames += this.fill;
    this.fill = 0;
  }

  process(inputs: Float32Array[][]): boolean {
    if (this.stopped) {
      this.flush();
      this.port.postMessage({ done: this.frames });
      return false;
    }
    const ch = inputs[0]?.[0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.fill++] = ch[i];
        if (this.fill === BLOCK) this.flush();
      }
    }
    return true;
  }
}
registerProcessor("take-capture", TakeCapture);
