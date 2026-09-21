import { describe, expect, it } from "vitest";
import { mixToMono, sumMono } from "./mono";

describe("mixToMono", () => {
  it("averages channels", () => {
    const out = mixToMono([Float32Array.of(1, 1), Float32Array.of(-1, 1)]);
    expect(Array.from(out)).toEqual([0, 1]);
  });
  it("returns a copy for a single channel", () => {
    const src = Float32Array.of(0.5, -0.5);
    const out = mixToMono([src]);
    expect(Array.from(out)).toEqual([0.5, -0.5]);
    expect(out).not.toBe(src);
  });
  it("returns an empty array for no channels", () => expect(mixToMono([]).length).toBe(0));
});

describe("sumMono", () => {
  it("adds each stem's mono mix", () => {
    const a = [Float32Array.of(1, 1), Float32Array.of(3, 3)]; // stereo, mono mix 2
    const b = [Float32Array.of(0.5, -1)];
    expect(Array.from(sumMono([a, b]))).toEqual([2.5, 1]);
  });
  it("is empty for no stems", () => {
    expect(sumMono([]).length).toBe(0);
  });
});
