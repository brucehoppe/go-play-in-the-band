/** Progressive tempo: start slow and speed up every few passes of the loop. Percentages are whole numbers. */
export interface Progressive {
  on: boolean;
  /** Starting speed, percent. */
  from: number;
  /** Added every `every` passes, percent. */
  step: number;
  every: number;
  /** Never above this, percent. */
  to: number;
}

export const DEFAULT_PROGRESSIVE: Progressive = { on: false, from: 60, step: 5, every: 2, to: 100 };

/** Keep the settings usable: 25..125, a positive step, at least one pass, `to` not below `from`. */
export function cleanProgressive(p: Progressive): Progressive {
  const pct = (v: number, d: number) => (Number.isFinite(v) ? Math.min(125, Math.max(25, Math.round(v / 5) * 5)) : d);
  const from = pct(p.from, 60);
  return {
    on: !!p.on,
    from,
    step: Number.isFinite(p.step) && p.step >= 5 ? Math.round(p.step / 5) * 5 : 5,
    every: Number.isFinite(p.every) && p.every >= 1 ? Math.round(p.every) : 1,
    to: Math.max(from, pct(p.to, 100)),
  };
}

/** The speed (percent) after `passes` complete passes since the ramp started. */
export function speedAfter(p: Progressive, passes: number): number {
  const steps = Math.floor(Math.max(0, passes) / Math.max(1, p.every));
  return Math.min(p.to, p.from + steps * p.step);
}

/** True once the ramp has reached its top. */
export function finished(p: Progressive, passes: number): boolean {
  return speedAfter(p, passes) >= p.to;
}
