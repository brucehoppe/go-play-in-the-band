export interface SongInfo {
  name: string;
  duration: number;
  bpm: number | null;
  timeSig: string | null;
  key: string | null;
  stemCount: number;
}

/** A named part of a song, in seconds. */
export interface Section {
  name: string;
  start: number;
  end: number;
}
