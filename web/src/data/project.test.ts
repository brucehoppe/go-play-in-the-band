import { describe, expect, it } from "vitest";
import { buildProject, isProjectFile, parseMeta, parseProject } from "./project";
import type { ProjectMeta } from "./project";

const meta: ProjectMeta = {
  version: 1,
  name: "song.mp3",
  bpm: 100,
  timeSig: "3/4",
  downbeat: 0.25,
  key: "A minor",
  transpose: -2,
  loops: [{ name: "Solo", start: 10, end: 20 }],
  mix: { bass: { level: 50, muted: false }, "Take 1": { level: 100, muted: true } },
};

describe("project file", () => {
  it("round-trips meta, the original file and takes", () => {
    const take = Float32Array.from([0, 0.5, -0.5, 0.25]);
    const zip = buildProject(meta, { name: "song.mp3", bytes: new Uint8Array([1, 2, 3]) }, [take, take], 44100);
    const p = parseProject(zip);
    expect(p.meta).toEqual({ ...meta, file: "original/song.mp3" });
    expect(p.file?.name).toBe("song.mp3");
    expect(p.takes).toHaveLength(2);
    expect(p.sampleRate).toBe(44100);
    expect(Array.from(p.takes[0]).map((v) => Math.round(v * 100) / 100)).toEqual([0, 0.5, -0.5, 0.25]);
  });

  it("works without an original file", () => {
    const p = parseProject(buildProject({ ...meta, name: "My recording" }, null, [new Float32Array(3)], 48000));
    expect(p.file).toBeNull();
    expect(p.meta.file).toBeUndefined();
  });

  it("cleans a doubtful project.json", () => {
    const m = parseMeta(JSON.stringify({ name: "x", bpm: 9999, timeSig: "lots", transpose: 40, loops: "no", mix: { a: { level: 500 } }, file: "../etc/passwd" }));
    expect(m).toEqual({ version: 1, name: "x", bpm: null, timeSig: null, downbeat: 0, key: null, transpose: 0, loops: [], mix: { a: { level: 100, muted: false } }, file: undefined });
    expect(() => parseMeta("{}")).toThrow(/song name/);
    expect(() => parseMeta("nope")).toThrow(/not valid/);
  });

  it("knows a project file by its extension", () => {
    expect(isProjectFile({ name: "a.ZIP" })).toBe(true);
    expect(isProjectFile({ name: "a.mp3" })).toBe(false);
  });
});
