import { describe, expect, it } from "vitest";
import { pixelPeak } from "./waveform";

// 4 buckets: [min, max] pairs
const peaks = Float32Array.of(-1, 1, -0.5, 0.5, -0.2, 0.2, 0, 0);

describe("pixelPeak", () => {
  it("merges buckets when there are more buckets than pixels", () => {
    expect(pixelPeak(peaks, 0, 2)).toEqual([-1, 1]);
    const [lo, hi] = pixelPeak(peaks, 1, 2);
    expect(lo).toBeCloseTo(-0.2);
    expect(hi).toBeCloseTo(0.2);
  });
  it("uses one bucket per pixel when there are more pixels than buckets", () => {
    expect(pixelPeak(peaks, 0, 8)).toEqual([-1, 1]);
    expect(pixelPeak(peaks, 1, 8)).toEqual([-1, 1]);
    expect(pixelPeak(peaks, 2, 8)).toEqual([-0.5, 0.5]);
  });
  it("returns [0, 0] for empty peaks", () => expect(pixelPeak(new Float32Array(0), 0, 10)).toEqual([0, 0]));
});
