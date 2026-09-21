import { describe, expect, it } from "vitest";
import { barLabel, barSeconds, beatsPerBar, gridLines, snapLoopToBars, snapToBar } from "./grid";

// 100 bpm in 4/4: a beat is 0.6 s, a bar is 2.4 s.
describe("grid", () => {
  it("barSeconds", () => {
    expect(barSeconds(100, 4)).toBeCloseTo(2.4, 9);
    expect(barSeconds(120, 3)).toBeCloseTo(1.5, 9);
  });

  it("beatsPerBar parses the time signature", () => {
    expect(beatsPerBar("4/4")).toBe(4);
    expect(beatsPerBar("3/4")).toBe(3);
    expect(beatsPerBar("6/8")).toBe(6);
    expect(beatsPerBar(null)).toBeNull();
    expect(beatsPerBar("oops")).toBeNull();
    expect(beatsPerBar("0/4")).toBeNull();
  });

  it("snapToBar picks the nearest bar line and never goes negative", () => {
    expect(snapToBar(3.5, 100, 4)).toBeCloseTo(2.4, 9);
    expect(snapToBar(3.7, 100, 4)).toBeCloseTo(4.8, 9);
    expect(snapToBar(-1, 100, 4)).toBe(0);
    expect(snapToBar(3.5, 100, 4, 0.5)).toBeCloseTo(2.9, 9);
    expect(snapToBar(0.1, 100, 4, 0.5)).toBeCloseTo(0.5, 9);
  });

  it("snapLoopToBars snaps both ends and keeps at least one bar", () => {
    const [s, e] = snapLoopToBars(4.9, 5.0, 100, 4, 38.4);
    expect(s).toBeCloseTo(4.8, 9);
    expect(e).toBeCloseTo(7.2, 9);
    const [s2, e2] = snapLoopToBars(2.5, 9.5, 100, 4, 38.4);
    expect(s2).toBeCloseTo(2.4, 9);
    expect(e2).toBeCloseTo(9.6, 9);
  });

  it("snapLoopToBars keeps end within the duration", () => {
    const [s, e] = snapLoopToBars(36.5, 40, 100, 4, 38.4);
    expect(e).toBeLessThanOrEqual(38.4);
    expect(e - s).toBeGreaterThanOrEqual(2.4 - 1e-9);
    expect(e).toBeCloseTo(38.4, 9);
    const [s3, e3] = snapLoopToBars(0, 1, 100, 4, 1);
    expect([s3, e3]).toEqual([0, 1]);
  });

  it("barLabel is 1-based with an inclusive end bar", () => {
    expect(barLabel(9.6, 19.2, 100, 4)).toBe("bars 5–8");
    expect(barLabel(0, 2.4, 100, 4)).toBe("bar 1");
  });

  it("gridLines lists beats in range with bar numbers on downbeats", () => {
    const lines = gridLines(2.4, 4.9, 100, 4);
    expect(lines.map((l) => l.beat)).toEqual([1, 2, 3, 4, 1]);
    expect(lines.map((l) => l.bar)).toEqual([2, null, null, null, 3]);
    expect(lines[0].sec).toBeCloseTo(2.4, 9);
    expect(lines[4].sec).toBeCloseTo(4.8, 9);
  });
});
