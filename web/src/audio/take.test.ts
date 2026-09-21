import { describe, expect, it } from "vitest";
import { alignTake, encodeWav, mixTakeWithBand, MIX_HEADROOM } from "./take";

describe("alignTake", () => {
  it("drops the latency from the start", () => {
    expect(Array.from(alignTake(Float32Array.of(1, 2, 3, 4), 2))).toEqual([3, 4]);
  });
  it("clamps a latency longer than the take", () => {
    expect(alignTake(Float32Array.of(1, 2), 10).length).toBe(0);
  });
});

describe("mixTakeWithBand", () => {
  it("uses the longer length and applies headroom", () => {
    const m = mixTakeWithBand(Float32Array.of(0.5, 0.5), Float32Array.of(0.5, 0.5, 0.5));
    expect(m.length).toBe(3);
    expect(m[0]).toBeCloseTo(1 * MIX_HEADROOM);
    expect(m[2]).toBeCloseTo(0.5 * MIX_HEADROOM);
  });
  it("never exceeds full scale", () => {
    const m = mixTakeWithBand(Float32Array.of(1, -1), Float32Array.of(1, -1), 2);
    expect(Math.max(...m)).toBeLessThanOrEqual(1);
    expect(Math.min(...m)).toBeGreaterThanOrEqual(-1);
  });
});

describe("encodeWav", () => {
  it("writes a valid 44-byte header and 16-bit data", () => {
    const w = encodeWav(Float32Array.of(0, 1, -1), 48000);
    const v = new DataView(w.buffer);
    expect(String.fromCharCode(...w.slice(0, 4))).toBe("RIFF");
    expect(w.length).toBe(44 + 6);
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getInt16(46, true)).toBe(32767);
    expect(v.getInt16(48, true)).toBe(-32767);
  });
});

import { measureLatency } from "./take";
describe("measureLatency", () => {
  it("finds the click offset", () => {
    const r = new Float32Array(1000);
    r[350] = 0.9;
    expect(measureLatency(r, 100)).toBe(250);
  });
  it("returns 0 when nothing was heard", () => {
    expect(measureLatency(new Float32Array(100), 0)).toBe(0);
  });
});
