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

import { waveLayers } from "./mono";
describe("waveLayers", () => {
  const g = { name: "guitar", channels: [Float32Array.of(0.5, -0.5, 0.25)] };
  const b = { name: "bass", channels: [Float32Array.of(0.1, 0.1, 0.1)] };
  it("a guitar-only song still has a full-length waveform", () => {
    const { band, guitar, mono } = waveLayers([g], "guitar");
    expect(Array.from(band)).toEqual([0, 0, 0]);
    expect(Array.from(guitar!)).toEqual([0.5, -0.5, 0.25]);
    expect(Array.from(mono)).toEqual([0.5, -0.5, 0.25]);
  });
  it("sums the band and keeps the guitar apart", () => {
    const { band, guitar, mono } = waveLayers([g, b], "guitar");
    expect(band[0]).toBeCloseTo(0.1);
    expect(guitar![0]).toBeCloseTo(0.5);
    expect(mono[0]).toBeCloseTo(0.6);
  });
  it("no guitar part means no guitar layer", () => {
    expect(waveLayers([b], "guitar").guitar).toBeNull();
  });
});
