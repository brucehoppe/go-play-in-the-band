# Practice tools: design

Requested 2026-09-22: "implement all" of the feature menu proposed that day. This records
the decisions. Everything runs in the browser except where noted; the demo keeps working
with no backend.

## Scope, in build order

### A. Engine
- **Loop pass events.** The worklet reports each loop wrap (`{type:"wrap"}`), the engine
  exposes `onWrap`. Used by progressive tempo and loop-aware overdubs.
- **Count-in.** `Transport.countIn(beats, beatFrames)` plays synthetic ticks (high on the
  first, low after) without advancing position, then plays. One bar by default, from the
  Loop panel ("Count-in" toggle). Needs a known tempo.
- **Transpose.** `dsp-core::pitch_shift`: time-stretch by `speed / 2^(semi/12)` then
  linear-interpolation resample by `2^(semi/12)`, so one stretch pass gives both speed and
  pitch. New wasm entries `render_mono` / `render_stereo` (speed, semitones); the old
  `stretch_*` stay. Engine keeps `semitones`, re-renders like a speed change. UI: a
  semitone select (-12..+12) in Song tools. Takes are stored as played (unshifted);
  documented as a limit.
- **Software monitor.** `Engine.monitor(on)` routes the chosen input through a gain to the
  output. A latency readout shows `baseLatency + outputLatency` in ms, and the calibrated
  round trip when known. Warns to use headphones. Lives in Audio devices.

### B. Recording
- **Record at any speed.** The take is aligned, then stretched by `1/speed` back to song
  time in the stretch worker (`stretchChannels([take], 1/speed)`), then placed. Status
  says the take was sped back up. The 100%-only guard goes.
- **Loop-aware overdubs.** When recording while looping, the take is cut into passes of
  the loop length (in recorded seconds: `(end-start)/speed`), starting from the offset of
  the record point inside the loop. Each complete pass becomes a take placed at the loop
  start, named "Take n" (numbers continue); every pass but the last is muted. A trailing
  partial pass is dropped unless it is the only one. Pure function `splitPasses` in
  `lib/passes.ts`.
- **Takes: compare and delete.** Take rows in the band panel get "Only this" (mutes the
  other takes, band untouched) and "Delete" (removes the part and its stored take, renumbers
  the rest). Pure helpers in `lib/takes.ts`.
- **Reopen "My recording".** The songs store (D) lists it; opening it loads Take 1 as the
  base part and the rest as overdubs. `open()` gets a `getStems` for that case.

### C. Loops, tempo and chords
- **Saved loops.** Per song, in IndexedDB key `loops:<song>`: `{name, start, end}[]`.
  Loop panel: "Save loop" with an inline name field (no dialogs), chips alongside the
  song sections, "×" to delete. Reloaded on open.
- **Progressive tempo.** In the Loop panel: start %, step %, every N passes, up to %.
  Counts wraps; on the Nth it moves the speed (re-render). The next speed is pre-rendered
  as soon as the current one starts, so the switch is instant. Off when looping stops.
  Pure `nextStep` in `lib/progressive.ts`.
- **Tempo tools.** Tap tempo (median of the last 8 intervals; `lib/tap.ts`). Time
  signature select (4/4, 3/4, 6/8, 2/4; 6/8 counts eighths). "Bar 1 here" sets the
  downbeat at the playhead; "◂ ▸" nudge it by 10 ms. The click and grid follow.
- **Chords.** `dsp-core::chords`: chroma per bar (given bpm, downbeat, beats per bar)
  matched against 24 major/minor templates, plus "N" when energy is low. Shown as a
  strip under the whole-song waveform and as labels on the loop grid. Estimated in the
  analysis worker whenever tempo, downbeat or time signature changes.

### D. Persistence and export
- **Songs store.** IndexedDB store `songs`: `{name, when, kind: "file"|"recording"|"demo",
  blob?}`. Files up to 64 MB are kept so they reopen after a reload. Start page shows a
  "Recent" list; entries can be removed.
- **Project zip.** `lib/zip.ts`: store-only zip writer and reader (CRC-32). "Save
  project" writes `project.json` (name, tempo, time sig, downbeat, key, transpose, loops,
  levels, mutes), the original file and takes as 16-bit WAV. "Load recording" accepts the
  zip and restores all of it. Stems are not stored; the splitter's cache regenerates them.
- **Export parts.** One zip of 16-bit WAVs, one per part, at its level (muted parts left
  out), next to "Export mix".

### E. Tuner
- `dsp-core::pitch` (YIN, 4096-sample window). The tuner panel reads the input through an
  AnalyserNode every 100 ms, sends the window to the analysis worker, shows note, cents and
  a needle. Reference tones for E2 A2 D3 G3 B3 E4 and A4 through an oscillator.

### F. Portfolio polish
- Second demo song: "Demo: E waltz", 3/4 at 90 BPM in E major, same synth, so 3/4 and
  transpose show. The header offers both demos.
- Mac app icon: `scripts/build.sh` renders `web/public/favicon.svg` to an `.icns` with
  `sips` and `iconutil` when available. No signing or notarising (dropped by the user).
- `scripts/demo-gif.mjs`: drives the built app in headless Chrome like the screenshot
  script and writes `docs/demo.gif` with an in-repo GIF encoder (no dependencies).
  Linked at the top of the README.

## Not done here
- Nothing is judged by ear; no real microphone or interface.
- Tempo detection itself is unchanged; the user corrects it with the new tools.

## Testing
Vitest for every pure module; Rust tests for pitch shift, chords and pitch detection;
the screenshot script's headless-Chrome run checks for console errors at the end.

## As built (2026-09-22)

Everything above is in, with these differences:

- Chroma for chords uses an 8192-point frame (5 Hz bins); the 2048-point frame put B's energy in the B-flat bin at low pitches.
- `Transport.render` takes the sample rate so the count-in ticks are synthesised at the right pitch; the worklet passes it.
- Take rows show "Only this take" only when there are two or more takes.
- The demo picker is a select in the header (two demos); the screenshot driver moved to `scripts/lib/chrome.mjs` and gained `select`, `type` and `check` helpers because of it.
- The GIF is six frames at 880 px, 290 KB, from `scripts/lib/gif.mjs` (PNG decode with zlib, popularity palette, LZW).
- The Mac icon comes from `scripts/make-icon.sh` (qlmanage, sips, iconutil); no signing.
- Not verified by ear or on hardware; see `docs/STATUS.md`.
