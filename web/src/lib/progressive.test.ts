import { describe, expect, it } from "vitest";
import { cleanProgressive, finished, speedAfter } from "./progressive";

describe("progressive tempo", () => {
  const p = { on: true, from: 60, step: 10, every: 2, to: 100 };

  it("steps up every N passes and stops at the top", () => {
    expect([0, 1, 2, 3, 4, 7, 8, 40].map((n) => speedAfter(p, n))).toEqual([60, 60, 70, 70, 80, 90, 100, 100]);
    expect(finished(p, 7)).toBe(false);
    expect(finished(p, 8)).toBe(true);
  });

  it("cleans odd settings", () => {
    expect(cleanProgressive({ on: true, from: 3, step: 0, every: 0, to: 1 })).toEqual({ on: true, from: 25, step: 5, every: 1, to: 25 });
    expect(cleanProgressive({ on: false, from: 62, step: 12, every: 2.4, to: 999 })).toEqual({ on: false, from: 60, step: 10, every: 2, to: 125 });
  });
});
