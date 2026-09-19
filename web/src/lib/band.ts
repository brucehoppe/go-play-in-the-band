export const GUITAR_PRESETS = [
  { label: "Mute", level: 0 },
  { label: "Quiet guide", level: 15 },
  { label: "Full", level: 100 },
] as const;

/** One line under the guitar slider that says what the current level is for. Level is 0..100. */
export function guitarHint(level: number): string {
  if (level <= 0) return "The guitar is yours. Play it against the band.";
  if (level <= 25) return "A quiet guide: enough to stay oriented.";
  return "Original guitar at full volume.";
}

export function stemLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
