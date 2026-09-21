import { describe, expect, it } from "vitest";
import { keyName, makeClick, parseBpm } from "./songtools";

describe("keyName", () => {
  it("names major and minor keys", () => {
    expect(keyName(0)).toBe("C major");
    expect(keyName(21)).toBe("A minor");
  });
  it("rejects anything else", () => {
    expect(keyName(-1)).toBeNull();
    expect(keyName(24)).toBeNull();
    expect(keyName(1.5)).toBeNull();
  });
});

describe("parseBpm", () => {
  it("accepts sensible tempos and rejects the rest", () => {
    expect(parseBpm("120")).toBe(120);
    expect(parseBpm("92.46")).toBe(92.5);
    expect(parseBpm("0")).toBeNull();
    expect(parseBpm("abc")).toBeNull();
    expect(parseBpm("900")).toBeNull();
  });
});

describe("makeClick", () => {
  const sr = 1000;
  const onsets = (x: Float32Array) => {
    const out: number[] = [];
    for (let i = 1; i < x.length; i++) if (x[i] !== 0 && x[i - 1] === 0 && (i < 2 || x[i - 2] === 0)) out.push(i - 1);
    return out;
  };
  it("ticks on every beat from the first downbeat", () => {
    const x = makeClick(120, 4, 0.25, 3000, sr);
    expect(onsets(x)).toEqual([250, 750, 1250, 1750, 2250, 2750]);
  });
  it("fills in beats before a late downbeat, keeping the bar aligned", () => {
    const x = makeClick(120, 4, 1.1, 2000, sr);
    expect(onsets(x)).toEqual([100, 600, 1100, 1600]);
    // the downbeat tick (at 1100) is the loud one
    expect(Math.max(...x.slice(1100, 1130))).toBeGreaterThan(Math.max(...x.slice(600, 630)));
  });
  it("never writes past the end", () => {
    expect(makeClick(120, 4, 0, 10, sr).length).toBe(10);
  });
});
