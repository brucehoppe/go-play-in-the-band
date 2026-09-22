import { describe, expect, it } from "vitest";
import { DEMO_INFO, DEMO_SECTIONS, DEMO_SONGS, demoSections, synthDemo, synthDemoStems } from "./demo";

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

describe("synthDemoStems", () => {
  const sr = 8000;
  const stems = synthDemoStems(sr, 4);
  const len = Math.floor(4 * 4 * 0.6 * sr);
  const rms = (a: Float32Array) => Math.sqrt(a.reduce((t, v) => t + v * v, 0) / a.length);

  it("returns guitar, bass, drums, keys and other, in that order", () => {
    expect(stems.map((s) => s.name)).toEqual(["guitar", "bass", "drums", "keys", "other"]);
  });

  it("gives every stem the same length on the 100 bpm bar grid", () => {
    for (const s of stems) {
      expect(s.channels.length).toBeGreaterThanOrEqual(1);
      for (const ch of s.channels) expect(ch.length).toBe(len);
    }
  });

  it("makes every stem audible", () => {
    for (const s of stems) expect(rms(s.channels[0])).toBeGreaterThan(0.005);
  });

  it("keeps the sum of all stems within peak 1", () => {
    const sum = new Float32Array(len);
    for (const s of stems) for (let i = 0; i < len; i++) sum[i] += s.channels[0][i];
    let peak = 0;
    for (const v of sum) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(0.3);
    expect(peak).toBeLessThanOrEqual(1);
  });

  it("is deterministic", () => {
    const again = synthDemoStems(sr, 4);
    for (let k = 0; k < stems.length; k++) {
      expect(Array.from(again[k].channels[0].slice(0, 800))).toEqual(Array.from(stems[k].channels[0].slice(0, 800)));
    }
  });

  it("plays the guitar riff on notes, not silence: the guitar is not the bass", () => {
    expect(Array.from(stems[0].channels[0].slice(0, 400))).not.toEqual(Array.from(stems[1].channels[0].slice(0, 400)));
  });

  it("synthDemo is the sum of the stems", () => {
    const mix = synthDemo(sr, 4);
    for (const i of [0, 137, 4000, len - 1]) {
      const sum = stems.reduce((t, s) => t + s.channels[0][i], 0);
      expect(mix[0][i]).toBeCloseTo(sum, 5);
    }
  });
});

describe("second demo (E waltz)", () => {
  const sr = 8000;
  const waltz = DEMO_SONGS[1];
  const stems = synthDemoStems(sr, 4, waltz);

  it("is in 3/4 at 90 bpm and sections cover it", () => {
    expect(waltz.timeSig).toBe("3/4");
    const len = Math.floor(4 * 3 * (60 / 90) * sr);
    for (const s of stems) expect(s.channels[0].length).toBe(len);
    const secs = demoSections(waltz);
    expect(secs[3].end).toBeCloseTo(16 * 3 * (60 / 90), 9);
  });

  it("differs from the first demo and stays within peak 1", () => {
    const first = synthDemoStems(sr, 4);
    expect(Array.from(stems[0].channels[0].slice(100, 400))).not.toEqual(Array.from(first[0].channels[0].slice(100, 400)));
    const n = stems[0].channels[0].length;
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(stems.reduce((t, s) => t + s.channels[0][i], 0)));
    expect(peak).toBeLessThanOrEqual(1);
  });
});
