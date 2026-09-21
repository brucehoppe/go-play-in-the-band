import type { Mixer } from "./mixer";

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

  /**
   * Fill one output block: out = sum over stems of stem * gain. `stems` is stem -> channels;
   * a stem with fewer channels than `out` feeds its last channel to the rest. Without a
   * mixer every stem plays at full gain. The mixer advances every block, paused or not,
   * so a ramp in progress finishes.
   */
  render(stems: Float32Array[][], out: Float32Array[], mixer?: Mixer): void {
    const n = out[0].length;
    const gains = mixer ? mixer.process(n) : null;
    if (!this.playing) {
      for (const o of out) o.fill(0);
      return;
    }
    if (this.loop) {
      this.renderLoop(stems, gains, out, n, this.loop);
      return;
    }
    const written = Math.min(n, Math.max(0, this.length - this.position));
    for (let c = 0; c < out.length; c++) {
      const o = out[c];
      o.fill(0);
      for (let k = 0; k < stems.length; k++) {
        const st = stems[k];
        const s = st[Math.min(c, st.length - 1)];
        const g = gains?.[k];
        const p0 = this.position;
        if (g) for (let i = 0; i < written; i++) o[i] += s[p0 + i] * g[i];
        else for (let i = 0; i < written; i++) o[i] += s[p0 + i];
      }
    }
    this.position += written;
    if (this.position >= this.length) this.playing = false;
  }

  /** Per-frame render so the wrap is sample-accurate inside a block. The linear crossfade is applied per stem, then gained and summed. */
  private renderLoop(
    stems: Float32Array[][],
    gains: Float32Array[] | null,
    out: Float32Array[],
    n: number,
    loop: { start: number; end: number },
  ): void {
    const { start, end } = loop;
    const F = this.fadeLength;
    const fadeStart = end - F;
    const startPos = this.position;
    for (let c = 0; c < out.length; c++) {
      let p = startPos;
      for (let i = 0; i < n; i++) {
        if (p >= this.length) {
          out[c][i] = 0;
          continue;
        }
        let acc = 0;
        const fading = F > 0 && p >= fadeStart && p < end;
        let cosA = 1;
        let sinA = 0;
        if (fading) {
          const a = (((p - fadeStart) / F) * Math.PI) / 2;
          cosA = Math.cos(a);
          sinA = Math.sin(a);
        }
        for (let k = 0; k < stems.length; k++) {
          const st = stems[k];
          const s = st[Math.min(c, st.length - 1)];
          const v = fading ? s[p] * cosA + s[start - F + (p - fadeStart)] * sinA : s[p];
          acc += gains ? v * gains[k][i] : v;
        }
        out[c][i] = acc;
        p++;
        if (p === end) p = start;
      }
      if (c === out.length - 1) this.position = p;
    }
    if (this.position >= this.length) this.playing = false;
  }
}
