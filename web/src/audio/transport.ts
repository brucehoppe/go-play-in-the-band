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

  /** How many times the loop has wrapped since it was set. */
  wraps = 0;

  /** Count-in frames still to play before the song moves. Ticks are synthesised here. */
  private preroll = 0;
  private prerollTotal = 0;
  private beatFrames = 0;
  private prerollBeats = 0;

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
    this.wraps = 0;
  }

  clearLoop(): void {
    this.loop = null;
    this.wraps = 0;
  }

  /** Before the next play, tick `beats` beats of `beatFrames` each (the first higher) while the song waits. */
  countIn(beats: number, beatFrames: number): void {
    const b = Math.max(0, Math.floor(beats));
    const f = Math.max(0, Math.floor(beatFrames));
    this.prerollBeats = b;
    this.beatFrames = f;
    this.prerollTotal = this.preroll = b * f;
  }

  /** True while the count-in ticks are still playing. */
  get countingIn(): boolean {
    return this.playing && this.preroll > 0;
  }

  /** Fill `out` with count-in ticks for its length and burn down the preroll. */
  private renderCountIn(out: Float32Array[], n: number, sampleRate: number): void {
    const tick = Math.round(sampleRate * 0.03);
    for (let i = 0; i < n; i++) {
      const at = this.prerollTotal - this.preroll + i;
      const beat = Math.floor(at / this.beatFrames);
      const inBeat = at - beat * this.beatFrames;
      let v = 0;
      if (inBeat < tick) {
        const first = beat % this.prerollBeats === 0;
        const freq = first ? 1760 : 1175;
        v = Math.sin((2 * Math.PI * freq * inBeat) / sampleRate) * Math.exp((-6 * inBeat) / tick) * (first ? 0.6 : 0.4);
      }
      for (const o of out) o[i] = v;
    }
    this.preroll -= n;
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
  render(stems: Float32Array[][], out: Float32Array[], mixer?: Mixer, sampleRate = 48000): void {
    const n = out[0].length;
    const gains = mixer ? mixer.process(n) : null;
    if (!this.playing) {
      for (const o of out) o.fill(0);
      return;
    }
    if (this.preroll > 0 && this.beatFrames > 0) {
      // Ticks for the part of the block still inside the count-in, then the song for the rest.
      const k = Math.min(n, this.preroll);
      this.renderCountIn(out.map((o) => o.subarray(0, k)), k, sampleRate);
      if (k < n) {
        const rest = out.map((o) => o.subarray(k));
        const restGains = gains ? gains.map((g) => g.subarray(k)) : null;
        if (this.loop) this.renderLoop(stems, restGains, rest, n - k, this.loop);
        else this.renderStraight(stems, restGains, rest, n - k);
      }
      return;
    }
    if (this.loop) {
      this.renderLoop(stems, gains, out, n, this.loop);
      return;
    }
    this.renderStraight(stems, gains, out, n);
  }

  private renderStraight(stems: Float32Array[][], gains: Float32Array[] | null, out: Float32Array[], n: number): void {
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
        if (p === end) {
          p = start;
          if (c === out.length - 1) this.wraps++;
        }
      }
      if (c === out.length - 1) this.position = p;
    }
    if (this.position >= this.length) this.playing = false;
  }
}
