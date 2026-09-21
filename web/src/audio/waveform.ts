/** Min and max for pixel column `x` of `width`, from interleaved [min, max] peaks. */
export function pixelPeak(peaks: Float32Array, x: number, width: number): [number, number] {
  const buckets = peaks.length / 2;
  const b0 = Math.floor((x * buckets) / width);
  const b1 = Math.max(b0 + 1, Math.floor(((x + 1) * buckets) / width));
  let lo = Infinity;
  let hi = -Infinity;
  for (let b = b0; b < Math.min(b1, buckets); b++) {
    lo = Math.min(lo, peaks[2 * b]);
    hi = Math.max(hi, peaks[2 * b + 1]);
  }
  return lo === Infinity ? [0, 0] : [lo, hi];
}

/** Draw the overview waveform as one vertical bar per pixel column. `scale` shrinks it toward the centre line; `clear` false layers it over what is already drawn. */
export function drawWaveform(
  ctx: CanvasRenderingContext2D,
  peaks: Float32Array,
  width: number,
  height: number,
  color: string,
  scale = 1,
  clear = true,
): void {
  if (clear) ctx.clearRect(0, 0, width, height);
  if (scale <= 0) return;
  ctx.fillStyle = color;
  const mid = height / 2;
  for (let x = 0; x < width; x++) {
    const [lo, hi] = pixelPeak(peaks, x, width);
    const y0 = mid - hi * scale * mid;
    const y1 = mid - lo * scale * mid;
    ctx.fillRect(x, y0, 1, Math.max(1, y1 - y0));
  }
}
