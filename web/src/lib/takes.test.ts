import { describe, expect, it } from "vitest";
import { isTake, onlyTake, renumberTakes } from "./takes";

describe("takes", () => {
  it("recognises take names", () => {
    expect(isTake("Take 3")).toBe(true);
    expect(isTake("Take")).toBe(false);
    expect(isTake("guitar")).toBe(false);
  });

  it("hears one take and leaves the band alone", () => {
    const names = ["bass", "drums", "Take 1", "Take 2", "Take 3"];
    expect(onlyTake(names, [true, false, false, false, false], 3)).toEqual([true, false, true, false, true]);
    expect(onlyTake(names, [true, false, true, true, true], -1)).toEqual([true, false, false, false, false]);
  });

  it("renumbers takes after a delete", () => {
    expect(renumberTakes(["bass", "Take 1", "Take 2", "Click", "Take 3"], 2)).toEqual(["bass", "Take 1", "Click", "Take 2"]);
  });
});
