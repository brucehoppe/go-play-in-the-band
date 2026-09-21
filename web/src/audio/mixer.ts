/**
 * Per-stem gain with a one-pole smoother (about 10 ms), advanced per sample so a
 * fader move or a mute never clicks. Pure logic, wrapped by the AudioWorklet.
 */
export class Mixer {
  private gain: Float32Array;
  private target: Float32Array;
  private readonly alpha: number;
  private curves: Float32Array[];

  constructor(
    public readonly count: number,
    sampleRate: number,
    timeConstantSec = 0.01,
  ) {
    this.gain = new Float32Array(count).fill(1);
    this.target = new Float32Array(count).fill(1);
    this.alpha = 1 - Math.exp(-1 / (timeConstantSec * sampleRate));
    this.curves = Array.from({ length: count }, () => new Float32Array(0));
  }

  /** Aim stem `i` at `level` (0..1), or at 0 when muted. The gain glides there. */
  setTarget(i: number, level: number, muted: boolean): void {
    if (i < 0 || i >= this.count) return;
    this.target[i] = muted ? 0 : Math.max(0, Math.min(1, level));
  }

  /** Advance `n` samples and return each stem's per-sample gain. The arrays are reused, so read them before the next call. */
  process(n: number): Float32Array[] {
    for (let i = 0; i < this.count; i++) {
      if (this.curves[i].length < n) this.curves[i] = new Float32Array(n);
      const c = this.curves[i];
      const t = this.target[i];
      let g = this.gain[i];
      for (let k = 0; k < n; k++) {
        g += (t - g) * this.alpha;
        c[k] = g;
      }
      this.gain[i] = g;
    }
    return this.curves;
  }
}
