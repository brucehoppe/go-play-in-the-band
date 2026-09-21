/** Which input and output to use. Empty string means the system default. */
export interface AudioChoice {
  input: string;
  /** -1 mixes both inputs of an interface; 0 or 1 picks Input 1 or Input 2. */
  channel: number;
  output: string;
}

export const DEFAULT_CHOICE: AudioChoice = { input: "", channel: -1, output: "" };
const KEY = "gpitb:audio";

/** A stored choice, checked field by field; anything odd falls back to the default. */
export function parseChoice(text: string | null): AudioChoice {
  try {
    const v = JSON.parse(text ?? "null") as Partial<AudioChoice> | null;
    if (!v || typeof v !== "object") return DEFAULT_CHOICE;
    const id = (s: unknown) => (typeof s === "string" && s.length <= 256 ? s : "");
    return { input: id(v.input), channel: v.channel === 0 || v.channel === 1 ? v.channel : -1, output: id(v.output) };
  } catch {
    return DEFAULT_CHOICE;
  }
}

export function loadChoice(): AudioChoice {
  try {
    return parseChoice(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_CHOICE;
  }
}

export function saveChoice(c: AudioChoice): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* this visit only */
  }
}

/** What to ask the browser for: the chosen device, raw (no voice processing), stereo so one input can be picked out, low latency. */
export function inputConstraints(c: AudioChoice): MediaTrackConstraints {
  return {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: { ideal: 2 },
    ...(c.input ? { deviceId: { exact: c.input } } : {}),
    // @ts-expect-error latency is a real constraint that TypeScript's DOM types leave out
    latency: { ideal: 0 },
  };
}
