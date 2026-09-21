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

/** Whether a part is silent: it is muted, or another part is soloed. */
export function isSilent(i: number, muted: boolean[], solo: number | null): boolean {
  return (solo !== null && solo !== i) || (solo !== i && (muted[i] ?? false));
}

/** What to tell someone who pressed Instruments when the splitter did not answer. */
export function splitterHelp(localApp: boolean): string {
  return localApp
    ? "The instrument splitter is not installed. Run scripts/install.sh once (Windows: scripts\\install.ps1; about 1 GB), then open the app again. Quick split works without it."
    : "Splitting into instruments runs on your own computer, not on this website. Get the local app (see the README), which installs and starts the splitter for you. Quick split works right here.";
}
