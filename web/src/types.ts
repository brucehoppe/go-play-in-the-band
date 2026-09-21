export interface SongInfo {
  name: string;
  duration: number;
  bpm: number | null;
  timeSig: string | null;
  key: string | null;
  stemCount: number;
  /** Seconds to the start of bar 1. 0 unless detected. */
  downbeat?: number;
  /** True when tempo and key were estimated from the audio rather than known. */
  estimated?: boolean;
}

/** A named part of a song, in seconds. */
export interface Section {
  name: string;
  start: number;
  end: number;
}

/** One separable part of a song: a name and its audio, channel by channel. */
export interface Stem {
  name: string;
  channels: Float32Array[];
}
