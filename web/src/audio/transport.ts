/**
 * Playback state for one song, in sample frames. Pure logic with no Web Audio
 * dependency, so it is unit-tested directly and wrapped by the AudioWorklet.
 */
export class Transport {
  position = 0;
  playing = false;

  /** Loop region in frames, or null. While playing, reaching `end` continues from `start`. */
  loop: { start: number; end: number } | null = null;

  /** `fadeFrames` is the wrap crossfade length (about 8 ms); it shrinks to fit the loop and the audio before `start`. */
  constructor(
    public length: number,
    private fadeFrames = 384,
  ) {}

  /** Frames actually crossfaded at the wrap. */
  get fadeLength(): number {
    if (!this.loop) return 0;
    return Math.max(0, Math.min(this.fadeFrames, this.loop.start, this.loop.end - this.loop.start));
  }

  setLoop(start: number, end: number): void {
    const s = Math.max(0, Math.min(this.length, Math.floor(start)));
    const e = Math.max(0, Math.min(this.length, Math.floor(end)));
    this.loop = e - s >= 1 ? { start: s, end: e } : null;
  }

  clearLoop(): void {
    this.loop = null;
  }

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
    if (this.loop) {
      this.renderLoop(src, out, n, this.loop);
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

  /** Per-frame render so the wrap is sample-accurate inside a block. */
  private renderLoop(src: Float32Array[], out: Float32Array[], n: number, loop: { start: number; end: number }): void {
    const { start, end } = loop;
    const F = this.fadeLength;
    const fadeStart = end - F;
    const startPos = this.position;
    for (let c = 0; c < out.length; c++) {
      const s = src[Math.min(c, src.length - 1)];
      let p = startPos;
      for (let i = 0; i < n; i++) {
        if (p >= this.length) {
          out[c][i] = 0;
          continue;
        }
        if (F > 0 && p >= fadeStart && p < end) {
          const k = p - fadeStart;
          const a = ((k / F) * Math.PI) / 2;
          out[c][i] = s[p] * Math.cos(a) + s[start - F + k] * Math.sin(a);
        } else {
          out[c][i] = s[p];
        }
        p++;
        if (p === end) p = start;
      }
      if (c === out.length - 1) this.position = p;
    }
    if (this.position >= this.length) this.playing = false;
  }
}
