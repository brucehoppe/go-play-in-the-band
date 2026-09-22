import { describe, expect, it } from "vitest";
import { bytesText, readZip, textBytes, writeZip } from "./zip";

describe("zip", () => {
  it("round-trips entries", () => {
    const big = new Uint8Array(70000).map((_, i) => i % 251);
    const zip = writeZip([
      { name: "project.json", data: textBytes('{"a":1}') },
      { name: "takes/Take 1.wav", data: big },
    ]);
    const back = readZip(zip);
    expect(back.map((e) => e.name)).toEqual(["project.json", "takes/Take 1.wav"]);
    expect(bytesText(back[0].data)).toBe('{"a":1}');
    expect(back[1].data).toEqual(big);
  });

  it("rejects junk and damage", () => {
    expect(() => readZip(new Uint8Array(10))).toThrow(/Not a zip/);
    const zip = writeZip([{ name: "x", data: textBytes("hello") }]);
    zip[30 + 1 + 1] ^= 0xff; // flip a byte of "hello"
    expect(() => readZip(zip)).toThrow(/damaged/);
  });

  it("is a zip other tools recognise (signatures in place)", () => {
    const zip = writeZip([{ name: "a.txt", data: textBytes("a") }]);
    const v = new DataView(zip.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint32(zip.length - 22, true)).toBe(0x06054b50);
  });
});
