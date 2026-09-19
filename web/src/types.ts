export interface SongInfo {
  name: string;
  duration: number;
  bpm: number | null;
  timeSig: string | null;
  key: string | null;
  stemCount: number;
}
