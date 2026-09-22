import { describe, expect, it } from "vitest";
import { parseSong } from "./songs";

describe("songs store", () => {
  it("accepts recordings and demos without a file", () => {
    expect(parseSong("My recording", { name: "My recording", when: 5, kind: "recording" })).toEqual({ name: "My recording", when: 5, kind: "recording" });
  });

  it("rejects mismatched keys, odd kinds and files without their blob", () => {
    expect(parseSong("a", { name: "b", when: 5, kind: "demo" })).toBeNull();
    expect(parseSong("a", { name: "a", when: 5, kind: "video" })).toBeNull();
    expect(parseSong("a", { name: "a", when: 5, kind: "file" })).toBeNull();
    expect(parseSong("a", null)).toBeNull();
  });

  it("keeps the blob of a file entry", () => {
    const blob = new Blob(["x"]);
    expect(parseSong("s.mp3", { name: "s.mp3", when: 1, kind: "file", blob })?.blob).toBe(blob);
  });
});
