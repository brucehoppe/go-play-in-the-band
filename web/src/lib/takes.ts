/** Helpers for the take rows in the band panel. Takes are the parts named "Take n". */

export const TAKE_RE = /^Take (\d+)$/;

export function isTake(name: string): boolean {
  return TAKE_RE.test(name);
}

/** Mute every take except `keep` (band parts untouched). `keep` -1 unmutes all takes. */
export function onlyTake(names: string[], muted: boolean[], keep: number): boolean[] {
  return names.map((n, k) => (isTake(n) ? (keep >= 0 ? k !== keep : false) : (muted[k] ?? false)));
}

/** Names after removing part `index`: takes are renumbered so they stay 1..n in order. */
export function renumberTakes(names: string[], index: number): string[] {
  let n = 0;
  return names.filter((_, k) => k !== index).map((name) => (isTake(name) ? `Take ${++n}` : name));
}
