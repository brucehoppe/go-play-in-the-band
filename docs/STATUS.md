# Status

A thought experiment and proof of concept. Expect rough edges.

## Checked

- The stretcher is measured, not heard: on synthetic plucked notes every pick attack comes out exactly once at 75%, 50% and 25% (the old one doubled all of them at 50% and 25%).
- Unit tests: web (Vitest), Rust (`dsp-core`, `desktop`), server (pytest). CI runs on macOS and Windows.
- Headless Chrome: the demo and real four-minute recordings load; speed, Record and overdub (fake
  microphone), song tools, quick split and the local app all run with no console errors.
- Quit: clicked in headless Chrome, the app and the splitter both stopped and freed their ports; six forged requests (GET, other origins, no origin, wrong host) were refused.
- Practice tools (2026-09-22) walked in headless Chrome with the fake microphone (`scripts/smoke.mjs`): count-in, progressive tempo stepping on a wrap, recording at 75% over a loop into pass takes, only-this-take and delete, saved loops surviving a reload, transpose, tap tempo, time signature, bar 1, tuner and monitor on and off, export parts, save project, the E waltz demo, and reopening "My recording" from Recent. No console errors. Rust tests cover pitch shift (length and pitch), chords on a synthetic Am C G Em progression, and the tuner on the six open strings.
- Layout measured in headless Chrome from 820 px wide up to 27-inch sizes (2560x1440 at 1x and 2x, 3840x2160): no overflow, header, content and transport line up, Play is always on screen, waveforms are drawn at the screen's pixel density.

## Not checked

- Nothing has been judged by ear: stretch quality at 25%, 50% and 75% (25% is likely to sound grainy), the quick split, the click track, the transpose (linear-interpolation resampling), a take stretched back from a slow speed, the count-in ticks.
- Chords are a triad template match on one chroma per bar; on the demo they read correctly (Am Am C G; E A B E, with one bar reading as the relative minor). On a real mix they are a guess.
- The tuner was tested on synthetic strings only; the monitor was switched on against Chrome's fake input.
- No real microphone or USB interface (device picking was run against Chrome's fake devices): whether overdubs line up in time, and how good calibration is.
- Tempo can be out by a factor of two; the first beat may not be beat one; 4/4 is assumed.
- Demucs was run on one real recording (solo guitar: 98% landed in the guitar stem, the stems add back up to within -34 dB). How cleanly it lifts a guitar out of a full band has not been heard.
- No real 27-inch monitor: the big-screen layout was measured in an emulated window, not looked at on hardware.
- The splitter's install and its start and stop by the app were run on this Mac only. On Windows the scripts are untested, and a force-quit app leaves the splitter running until the next launch reuses it.
- The Windows app is built in CI only, never run by hand. The Mac app has no icon and is not notarised.

## Known limits

- Use headphones, or the microphone re-records the band (and the software monitor feeds back).
- Takes are stored as played: transposing the band does not transpose the takes, and a take recorded at a slow speed is time-stretched back, so it carries the stretcher's artefacts.
- Progressive tempo pauses for a moment at a step when the next speed is not rendered yet (a long loop, or a step taken quickly).
- Choosing an output needs Chrome or Edge. The software monitor goes through the browser, so it is late by the delay shown; an interface's direct monitoring is not.
- Recent songs keep files up to 64 MB in the browser's storage; bigger ones must be loaded again by hand. A project zip holds the original file and takes, not the split stems.
- Quick split resets the tempo to 100%.
- Quick split works on the mono mix and cannot isolate a single instrument; Instruments (Demucs) can.
- In a dense full mix the stretcher protects only the strongest attacks.
