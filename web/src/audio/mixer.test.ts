import { describe, expect, it } from "vitest";
import { Mixer } from "./mixer";

const SR = 48000;
const ms = (t: number) => Math.round((t / 1000) * SR);

describe("Mixer", () => {
  it("starts every stem at full level with no ramp", () => {
    const m = new Mixer(2, SR);
    const c = m.process(64);
    expect(c[0][0]).toBe(1);
    expect(c[1][63]).toBe(1);
  });

  it("reaches 95% of a new target within 50 ms", () => {
    const m = new Mixer(1, SR);
    m.setTarget(0, 0.4, false);
    const c = m.process(ms(50) + 1)[0];
    const from = 1;
    const to = 0.4;
    expect(Math.abs(c[ms(50)] - to)).toBeLessThanOrEqual(0.05 * Math.abs(from - to));
  });

  it("has no large sample-to-sample gain step", () => {
    const m = new Mixer(1, SR);
    m.setTarget(0, 0, false);
    const c = m.process(ms(100))[0];
    let worst = 0;
    for (let i = 1; i < c.length; i++) worst = Math.max(worst, Math.abs(c[i] - c[i - 1]));
    expect(worst).toBeLessThan(0.005);
  });

  it("stays smooth across block boundaries", () => {
    const m = new Mixer(1, SR);
    m.setTarget(0, 0, false);
    const a = m.process(128)[0][127];
    const b = m.process(128)[0][0];
    expect(a - b).toBeGreaterThan(0);
    expect(a - b).toBeLessThan(0.005);
  });

  it("mute ramps to 0 and unmute restores the level", () => {
    const m = new Mixer(1, SR);
    m.setTarget(0, 0.8, false);
    m.process(ms(200));
    m.setTarget(0, 0.8, true);
    const down = m.process(ms(200))[0];
    expect(down[down.length - 1]).toBeLessThan(1e-3);
    expect(down[0]).toBeGreaterThan(0.5); // ramped, not cut
    m.setTarget(0, 0.8, false);
    const up = m.process(ms(200))[0];
    expect(up[up.length - 1]).toBeCloseTo(0.8, 2);
  });

  it("clamps levels to 0..1", () => {
    const m = new Mixer(1, SR);
    m.setTarget(0, 5, false);
    expect(m.process(ms(200))[0][ms(200) - 1]).toBeCloseTo(1, 3);
    m.setTarget(0, -3, false);
    expect(m.process(ms(200))[0][ms(200) - 1]).toBeCloseTo(0, 3);
  });

  it("moves each stem independently", () => {
    const m = new Mixer(3, SR);
    m.setTarget(1, 0, false);
    const c = m.process(ms(200));
    expect(c[0][ms(200) - 1]).toBe(1);
    expect(c[1][ms(200) - 1]).toBeLessThan(1e-3);
    expect(c[2][ms(200) - 1]).toBe(1);
  });

  it("ignores an out-of-range stem index", () => {
    const m = new Mixer(1, SR);
    expect(() => m.setTarget(4, 0, true)).not.toThrow();
  });
});
