import { describe, expect, it } from "vitest";
import { Transport } from "./transport";

const src = [Float32Array.from({ length: 10 }, (_, i) => i + 1)]; // 1..10

function block(n: number, channels = 1): Float32Array[] {
  return Array.from({ length: channels }, () => new Float32Array(n).fill(-9));
}

describe("Transport", () => {
  it("outputs silence and stays put while paused", () => {
    const t = new Transport(10);
    const out = block(4);
    t.render(src, out);
    expect(Array.from(out[0])).toEqual([0, 0, 0, 0]);
    expect(t.position).toBe(0);
  });

  it("copies source frames and advances while playing", () => {
    const t = new Transport(10);
    t.play();
    const out = block(4);
    t.render(src, out);
    expect(Array.from(out[0])).toEqual([1, 2, 3, 4]);
    expect(t.position).toBe(4);
    expect(t.playing).toBe(true);
  });

  it("zero-fills and stops at the end of the song", () => {
    const t = new Transport(10);
    t.play();
    t.render(src, block(8));
    const out = block(8);
    t.render(src, out);
    expect(Array.from(out[0])).toEqual([9, 10, 0, 0, 0, 0, 0, 0]);
    expect(t.position).toBe(10);
    expect(t.playing).toBe(false);
  });

  it("restarts from the top when played at the end", () => {
    const t = new Transport(10);
    t.seek(10);
    t.play();
    expect(t.position).toBe(0);
    expect(t.playing).toBe(true);
  });

  it("clamps seeks to the song", () => {
    const t = new Transport(10);
    t.seek(-5);
    expect(t.position).toBe(0);
    t.seek(999);
    expect(t.position).toBe(10);
    t.seek(3.9);
    expect(t.position).toBe(3);
  });

  it("feeds a mono source to every output channel", () => {
    const t = new Transport(10);
    t.play();
    const out = block(3, 2);
    t.render(src, out);
    expect(Array.from(out[0])).toEqual([1, 2, 3]);
    expect(Array.from(out[1])).toEqual([1, 2, 3]);
  });

  it("pause keeps the position", () => {
    const t = new Transport(10);
    t.play();
    t.render(src, block(4));
    t.pause();
    t.render(src, block(4));
    expect(t.position).toBe(4);
  });
});
