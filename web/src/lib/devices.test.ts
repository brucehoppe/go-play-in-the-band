import { describe, expect, it } from "vitest";
import { DEFAULT_CHOICE, inputConstraints, parseChoice } from "./devices";

describe("parseChoice", () => {
  it("reads a good choice", () => {
    expect(parseChoice('{"input":"abc","channel":1,"output":"xyz"}')).toEqual({ input: "abc", channel: 1, output: "xyz" });
  });
  it("falls back on anything odd", () => {
    expect(parseChoice(null)).toEqual(DEFAULT_CHOICE);
    expect(parseChoice("not json")).toEqual(DEFAULT_CHOICE);
    expect(parseChoice('{"input":5,"channel":7,"output":null}')).toEqual(DEFAULT_CHOICE);
    expect(parseChoice(JSON.stringify({ input: "x".repeat(300) })).input).toBe("");
  });
});

describe("inputConstraints", () => {
  it("turns voice processing off and asks for stereo", () => {
    const c = inputConstraints(DEFAULT_CHOICE);
    expect(c.echoCancellation).toBe(false);
    expect(c.noiseSuppression).toBe(false);
    expect(c.autoGainControl).toBe(false);
    expect(c.channelCount).toEqual({ ideal: 2 });
    expect(c.deviceId).toBeUndefined();
  });
  it("asks for the exact device when one is chosen", () => {
    expect(inputConstraints({ ...DEFAULT_CHOICE, input: "usb-1" }).deviceId).toEqual({ exact: "usb-1" });
  });
});
