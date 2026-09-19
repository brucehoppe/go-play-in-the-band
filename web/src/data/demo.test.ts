import { describe, expect, it } from "vitest";
import { DEMO_INFO, DEMO_SECTIONS, synthDemo } from "./demo";

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

describe("DEMO_SECTIONS", () => {
  it("covers the 16-bar demo with four 4-bar sections", () => {
    const bar = (60 / DEMO_INFO.bpm) * 4;
    expect(DEMO_SECTIONS.map((s) => s.name)).toEqual(["Intro", "Verse", "Chorus", "Solo"]);
    expect(DEMO_SECTIONS[0].start).toBe(0);
    for (const s of DEMO_SECTIONS) expect(s.end - s.start).toBeCloseTo(4 * bar, 9);
    for (let i = 1; i < DEMO_SECTIONS.length; i++) expect(DEMO_SECTIONS[i].start).toBeCloseTo(DEMO_SECTIONS[i - 1].end, 9);
    expect(DEMO_SECTIONS[3].end).toBeCloseTo(16 * bar, 9);
  });
});
