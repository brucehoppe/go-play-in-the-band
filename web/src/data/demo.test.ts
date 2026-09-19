import { describe, expect, it } from "vitest";
import { synthDemo } from "./demo";

describe("synthDemo", () => {
  const sr = 8000;
  const ch = synthDemo(sr, 2);

  it("makes two channels of the expected length (2 bars of 4 beats at 100 bpm)", () => {
    expect(ch).toHaveLength(2);
    expect(ch[0].length).toBe(Math.floor(2 * 4 * 0.6 * sr));
  });

  it("is audible and never clips", () => {
    let peak = 0;
    for (const v of ch[0]) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThanOrEqual(1);
  });

  it("is deterministic", () => {
    expect(Array.from(synthDemo(sr, 2)[0].slice(0, 500))).toEqual(Array.from(ch[0].slice(0, 500)));
  });
});
