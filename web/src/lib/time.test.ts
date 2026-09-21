import { describe, expect, it } from "vitest";
import { formatTime, xToSeconds } from "./time";

describe("formatTime", () => {
  it("formats zero", () => expect(formatTime(0)).toBe("0:00.0"));
  it("formats minutes, seconds and tenths", () => expect(formatTime(65.25)).toBe("1:05.2"));
  it("clamps negatives and non-finite to zero", () => {
    expect(formatTime(-3)).toBe("0:00.0");
    expect(formatTime(Number.NaN)).toBe("0:00.0");
  });
});

describe("xToSeconds", () => {
  it("maps the left edge, middle and right edge", () => {
    expect(xToSeconds(0, 200, 60)).toBe(0);
    expect(xToSeconds(100, 200, 60)).toBe(30);
    expect(xToSeconds(200, 200, 60)).toBe(60);
  });
  it("clamps outside the width", () => {
    expect(xToSeconds(-10, 200, 60)).toBe(0);
    expect(xToSeconds(999, 200, 60)).toBe(60);
  });
  it("returns 0 for a zero-width element", () => expect(xToSeconds(5, 0, 60)).toBe(0));
});
