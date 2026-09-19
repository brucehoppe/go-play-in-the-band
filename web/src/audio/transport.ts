/**
 * Playback state for one song, in sample frames. Pure logic with no Web Audio
 * dependency, so it is unit-tested directly and wrapped by the AudioWorklet.
 */
export class Transport {
  position = 0;
  playing = false;

  constructor(public length: number) {}

  play(): void {
    if (this.position >= this.length) this.position = 0;
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  seek(frame: number): void {
    this.position = Math.max(0, Math.min(this.length, Math.floor(frame)));
  }

  /** Fill one output block. A source with fewer channels than `out` feeds its last channel to the rest. */
  render(src: Float32Array[], out: Float32Array[]): void {
    const n = out[0].length;
    if (!this.playing) {
      for (const o of out) o.fill(0);
      return;
    }
    const written = Math.min(n, Math.max(0, this.length - this.position));
    for (let c = 0; c < out.length; c++) {
      const s = src[Math.min(c, src.length - 1)];
      out[c].set(s.subarray(this.position, this.position + written));
      out[c].fill(0, written);
    }
    this.position += written;
    if (this.position >= this.length) this.playing = false;
  }
}
