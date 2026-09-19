import { describe, expect, it } from "vitest";
import { mixToMono } from "./mono";

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
