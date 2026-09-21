import { describe, expect, it } from "vitest";
import { GUITAR_PRESETS, guitarHint, stemLabel } from "./band";

describe("guitarHint", () => {
  it("changes with the level", () => {
    expect(guitarHint(0)).toBe("The guitar is yours. Play it against the band.");
    expect(guitarHint(15)).toBe("A quiet guide: enough to stay oriented.");
    expect(guitarHint(25)).toBe("A quiet guide: enough to stay oriented.");
    expect(guitarHint(26)).toBe("Original guitar at full volume.");
    expect(guitarHint(100)).toBe("Original guitar at full volume.");
  });
});

describe("GUITAR_PRESETS", () => {
  it("are Mute 0, Quiet guide 15, Full 100", () => {
    expect(GUITAR_PRESETS.map((p) => [p.label, p.level])).toEqual([
      ["Mute", 0],
      ["Quiet guide", 15],
      ["Full", 100],
    ]);
  });
});

describe("stemLabel", () => {
  it("capitalises the first letter", () => {
    expect(stemLabel("bass")).toBe("Bass");
    expect(stemLabel("Full mix")).toBe("Full mix");
  });
});

import { isSilent } from "./band";
describe("isSilent", () => {
  it("follows mutes when nothing is soloed", () => {
    expect(isSilent(0, [true, false], null)).toBe(true);
    expect(isSilent(1, [true, false], null)).toBe(false);
  });
  it("solo silences every other part and is heard even if muted", () => {
    expect(isSilent(0, [false, false], 1)).toBe(true);
    expect(isSilent(1, [false, true], 1)).toBe(false);
  });
});
