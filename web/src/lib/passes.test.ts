import { describe, expect, it } from "vitest";
import { splitPasses } from "./passes";

const ramp = (n: number) => Float32Array.from({ length: n }, (_, i) => i + 1);

describe("splitPasses", () => {
  it("cuts a recording that started at the loop start into whole passes", () => {
    const passes = splitPasses(ramp(10), 0, 4);
    // 1-4 | 5-8 | 9-10 (partial, dropped)
    expect(passes.map((p) => Array.from(p.samples))).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ]);
    expect(passes.every((p) => p.complete)).toBe(true);
  });

  it("starts the first pass mid-loop and pads it with silence", () => {
    const passes = splitPasses(ramp(6), 2, 4);
    // frames 1,2 land at loop positions 2,3; then 3-6 is a complete pass
    expect(passes.map((p) => Array.from(p.samples))).toEqual([[3, 4, 5, 6]]);
  });

  it("keeps the fullest partial pass when none is complete", () => {
    const passes = splitPasses(ramp(5), 3, 4);
    // 1 lands at position 3 (1 frame); then 2-5 is a complete pass
    expect(passes.map((p) => Array.from(p.samples))).toEqual([[2, 3, 4, 5]]);
    const short = splitPasses(ramp(3), 1, 4);
    expect(short).toHaveLength(1);
    expect(Array.from(short[0].samples)).toEqual([0, 1, 2, 3]);
    expect(short[0].complete).toBe(false);
    const wrapped = splitPasses(ramp(3), 3, 4); // 1 frame, then 2 frames of a new pass
    expect(Array.from(wrapped[0].samples)).toEqual([2, 3, 0, 0]);
  });

  it("returns nothing for an empty take", () => {
    expect(splitPasses(new Float32Array(0), 0, 4)).toEqual([]);
  });
});
