import { describe, expect, it } from "vitest";
import { addTap, tapBpm } from "./tap";

describe("tap tempo", () => {
  it("finds the tempo from the median gap", () => {
    let taps: number[] = [];
    for (const t of [0, 500, 1000, 1520, 2000]) taps = addTap(taps, t);
    expect(tapBpm(taps)).toBe(120);
  });

  it("starts over after a long pause and keeps the last eight", () => {
    let taps: number[] = [];
    for (let i = 0; i < 12; i++) taps = addTap(taps, i * 400);
    expect(taps).toHaveLength(8);
    taps = addTap(taps, 20000);
    expect(taps).toEqual([20000]);
    expect(tapBpm(taps)).toBeNull();
  });

  it("ignores absurd tempos", () => {
    expect(tapBpm([0, 10])).toBeNull();
  });
});
