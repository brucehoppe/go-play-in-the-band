import { describe, expect, it } from "vitest";
import { parseLoops, upsertLoop } from "./loops";

describe("saved loops", () => {
  it("keeps only well-formed entries", () => {
    expect(parseLoops([{ name: "Solo", start: 10, end: 20 }, { name: "", start: 0, end: 1 }, { name: "bad", start: 5, end: 5 }, "x", null, { name: "neg", start: -1, end: 3 }])).toEqual([
      { name: "Solo", start: 10, end: 20 },
    ]);
    expect(parseLoops("nope")).toEqual([]);
  });

  it("replaces by name and keeps the list in time order", () => {
    const a = upsertLoop([], { name: "Solo", start: 30, end: 40 });
    const b = upsertLoop(a, { name: "Intro", start: 0, end: 8 });
    const c = upsertLoop(b, { name: "Solo", start: 32, end: 40 });
    expect(c).toEqual([
      { name: "Intro", start: 0, end: 8 },
      { name: "Solo", start: 32, end: 40 },
    ]);
  });
});
