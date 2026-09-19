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

describe("Transport loop", () => {
  const SR = 8000;
  const ramp = (n: number) => [Float32Array.from({ length: n }, (_, i) => i * 0.001)];

  function make(len: number, start: number, end: number, fade?: number) {
    const t = new Transport(len, fade);
    t.setLoop(start, end);
    t.seek(start);
    t.play();
    return t;
  }

  it("setLoop clamps and clears when shorter than one frame", () => {
    const t = new Transport(100);
    t.setLoop(-5, 500);
    expect(t.loop).toEqual({ start: 0, end: 100 });
    t.setLoop(50, 50);
    expect(t.loop).toBeNull();
    t.setLoop(10, 20);
    t.clearLoop();
    expect(t.loop).toBeNull();
  });

  it("(a) wraps exactly to start after each pass with zero drift", () => {
    const start = 2 * SR;
    const end = 12 * SR; // 10 s loop
    const len = 30 * SR;
    const s = ramp(len);
    const t = make(len, start, end);
    const out = [new Float32Array(128)];
    let frames = 0;
    let passes = 0;
    const loopLen = end - start;
    while (passes < 20) {
      const before = t.position;
      t.render(s, out);
      frames += 128;
      expect(t.playing).toBe(true);
      expect(t.position).toBeGreaterThanOrEqual(start);
      expect(t.position).toBeLessThan(end);
      if (frames % loopLen < 128 && frames >= loopLen * (passes + 1)) {
        passes++;
        expect(t.position).toBe(start + (frames - passes * loopLen));
      }
      void before;
    }
    expect(frames).toBeGreaterThanOrEqual(20 * loopLen);
    expect(t.position).toBe(start + (frames - 20 * loopLen));
  });

  it("(a) returns to exactly start when a block lands on the loop end", () => {
    const s = ramp(1000);
    const t = make(1000, 100, 356, 16);
    const out = [new Float32Array(128)];
    t.render(s, out);
    t.render(s, out);
    expect(t.position).toBe(100);
  });

  it("(b) has no click across the wrap", () => {
    const len = 4000;
    const w = (2 * Math.PI) / 200; // 200-frame period; the 2000-frame loop holds whole periods
    const s = [Float32Array.from({ length: len }, (_, i) => Math.sin(i * w))];
    const step = w; // max source step
    const t = make(len, 1000, 3000, 384);
    const all: number[] = [];
    const out = [new Float32Array(128)];
    for (let i = 0; i < 60; i++) {
      t.render(s, out);
      all.push(...out[0]);
    }
    let maxJump = 0;
    for (let i = 1; i < all.length; i++) maxJump = Math.max(maxJump, Math.abs(all[i] - all[i - 1]));
    expect(maxJump).toBeLessThanOrEqual(step * 1.02);
  });

  it("crossfade lands on src[start-1] at end-1 and src[start] next", () => {
    const s = [Float32Array.from({ length: 100 }, (_, i) => i + 1)];
    const t = make(100, 20, 60, 8);
    t.seek(52);
    const out = [new Float32Array(9)];
    t.render(s, out);
    // p=59 is t=7/8 so not fully src[19]; check next sample is src[start]
    expect(out[0][8]).toBe(s[0][20]);
    const t2 = make(100, 20, 60, 8);
    t2.seek(52);
    const o2 = [new Float32Array(8)];
    t2.render(s, o2);
    const tt = 7 / 8;
    expect(o2[0][7]).toBeCloseTo(s[0][59] * Math.cos((tt * Math.PI) / 2) + s[0][19] * Math.sin((tt * Math.PI) / 2), 5);
    expect(o2[0][0]).toBeCloseTo(s[0][52], 5);
  });

  it("(c) the fade shrinks when start < fade", () => {
    const s = [Float32Array.from({ length: 100 }, (_, i) => i + 1)];
    const t = make(100, 4, 60, 384);
    expect(t.fadeLength).toBe(4);
    t.seek(56);
    const out = [new Float32Array(5)];
    t.render(s, out);
    // F=4: p=56 is t=0 -> src[56]; next sample is src[start]
    expect(out[0][0]).toBeCloseTo(s[0][56], 5);
    expect(out[0][4]).toBe(s[0][4]);
  });

  it("with start 0 there is no fade, a hard wrap", () => {
    const s = [Float32Array.from({ length: 100 }, (_, i) => i + 1)];
    const t = make(100, 0, 10, 384);
    const out = [new Float32Array(12)];
    t.render(s, out);
    expect(Array.from(out[0].slice(8, 12))).toEqual([9, 10, 1, 2]);
  });

  it("(d) no loop behaves as before; a position past the loop plays on and stops at the song end", () => {
    const s = ramp(50);
    const t = new Transport(50);
    t.setLoop(10, 20);
    t.seek(30);
    t.play();
    t.render(s, [new Float32Array(30)]);
    expect(t.position).toBe(50);
    expect(t.playing).toBe(false);
  });

  it("plays normally from before the loop start until it reaches end, then wraps", () => {
    const s = ramp(100);
    const t = new Transport(100, 4);
    t.setLoop(40, 60);
    t.seek(0);
    t.play();
    t.render(s, [new Float32Array(70)]);
    expect(t.position).toBe(40 + 10);
    expect(t.playing).toBe(true);
  });

  it("(e) reaching end of a loop does not stop, even if the loop ends at the song end", () => {
    const s = ramp(100);
    const t = make(100, 50, 100, 8);
    t.render(s, [new Float32Array(200)]);
    expect(t.playing).toBe(true);
    expect(t.position).toBe(50 + (200 - 50) % 50);
  });

  it("seeking outside the loop is allowed", () => {
    const t = new Transport(100);
    t.setLoop(40, 60);
    t.seek(5);
    expect(t.position).toBe(5);
  });
});
