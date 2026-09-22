import { describe, expect, it } from "vitest";
import { chordName, chordRuns, noteFor } from "./chords";

describe("chords", () => {
  it("names chords", () => {
    expect(chordName(0)).toBe("C");
    expect(chordName(21)).toBe("Am");
    expect(chordName(-1)).toBeNull();
    expect(chordName(24)).toBeNull();
  });

  it("collapses repeated bars into runs and skips unknown bars", () => {
    expect(chordRuns([21, 21, 0, -1, 0, 7])).toEqual([
      { bar: 0, name: "Am", bars: 2 },
      { bar: 2, name: "C", bars: 1 },
      { bar: 4, name: "C", bars: 1 },
      { bar: 5, name: "G", bars: 1 },
    ]);
  });

  it("names a pitch with cents", () => {
    expect(noteFor(440)).toEqual({ name: "A", octave: 4, cents: 0 });
    expect(noteFor(82.41)?.name).toBe("E");
    expect(noteFor(82.41)?.octave).toBe(2);
    expect(noteFor(445)?.cents).toBe(20);
    expect(noteFor(0)).toBeNull();
  });
});
