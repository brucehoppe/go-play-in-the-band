import { describe, expect, it } from "vitest";
import { MIN_LOOP, isOnBars, loopName, moveHandle, setIn, setOut } from "./loop";

const D = 100;

describe("loop editing", () => {
  it("setIn moves the start and keeps in < out", () => {
    expect(setIn({ start: 10, end: 20 }, 15, D)).toEqual({ start: 15, end: 20 });
    const l = setIn({ start: 10, end: 20 }, 30, D);
    expect(l.start).toBe(30);
    expect(l.end).toBeGreaterThan(30);
  });

  it("setIn with no loop makes a default-length loop and never passes the song end", () => {
    expect(setIn(null, 10, D, 4)).toEqual({ start: 10, end: 14 });
    const l = setIn(null, 99, D, 4);
    expect(l.end).toBe(100);
    expect(l.end - l.start).toBeGreaterThanOrEqual(MIN_LOOP - 1e-9);
  });

  it("setOut moves the end and keeps in < out", () => {
    expect(setOut({ start: 10, end: 20 }, 15, D)).toEqual({ start: 10, end: 15 });
    const l = setOut({ start: 10, end: 20 }, 5, D);
    expect(l.end).toBe(5);
    expect(l.start).toBeLessThan(5);
    expect(setOut(null, 10, D, 4)).toEqual({ start: 6, end: 10 });
    expect(setOut(null, 1, D, 4).start).toBe(0);
  });

  it("moveHandle clamps to the song and the other handle", () => {
    expect(moveHandle({ start: 10, end: 20 }, "in", -5, D).start).toBe(0);
    expect(moveHandle({ start: 10, end: 20 }, "in", 25, D).start).toBeCloseTo(20 - MIN_LOOP, 9);
    expect(moveHandle({ start: 10, end: 20 }, "out", 500, D).end).toBe(100);
    expect(moveHandle({ start: 10, end: 20 }, "out", 1, D).end).toBeCloseTo(10 + MIN_LOOP, 9);
  });

  it("isOnBars and loopName", () => {
    expect(isOnBars({ start: 9.6, end: 19.2 }, 100, 4)).toBe(true);
    expect(isOnBars({ start: 9.7, end: 19.2 }, 100, 4)).toBe(false);
    expect(loopName({ start: 9.6, end: 19.2 }, 100, 4)).toBe("Loop, bars 5–8");
    expect(loopName({ start: 9.7, end: 19.2 }, 100, 4)).toBe("Loop, 0:09.7 to 0:19.2");
    expect(loopName({ start: 9.6, end: 19.2 }, null, null)).toBe("Loop, 0:09.6 to 0:19.2");
  });
});
