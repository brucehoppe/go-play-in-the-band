# Status

A thought experiment and proof of concept. Expect rough edges.

## Checked

- The stretcher is measured, not heard: on synthetic plucked notes every pick attack comes out exactly once at 75%, 50% and 25% (the old one doubled all of them at 50% and 25%).
- Unit tests: web (Vitest), Rust (`dsp-core`, `desktop`), server (pytest). CI runs on macOS and Windows.
- Headless Chrome: the demo and real four-minute recordings load; speed, Record and overdub (fake
  microphone), song tools, quick split and the local app all run with no console errors.
- Layout measured in headless Chrome from 820 px wide up to 27-inch sizes (2560x1440 at 1x and 2x, 3840x2160): no overflow, header, content and transport line up, Play is always on screen, waveforms are drawn at the screen's pixel density.

## Not checked

- Nothing has been judged by ear: stretch quality at 25%, 50% and 75% (25% is likely to sound grainy), the quick split, the click track.
- No real microphone or USB interface (device picking was run against Chrome's fake devices): whether overdubs line up in time, and how good calibration is.
- Tempo can be out by a factor of two; the first beat may not be beat one; 4/4 is assumed.
- Demucs was run on one real recording (solo guitar: 98% landed in the guitar stem, the stems add back up to within -34 dB). How cleanly it lifts a guitar out of a full band has not been heard.
- No real 27-inch monitor: the big-screen layout was measured in an emulated window, not looked at on hardware.
- The splitter's install and its start and stop by the app were run on this Mac only. On Windows the scripts are untested, and a force-quit app leaves the splitter running until the next launch reuses it.
- The Windows app is built in CI only, never run by hand. The Mac app has no icon and is not notarised.

## Known limits

- Recording works at 100% speed only. Use headphones, or the microphone re-records the band.
- A take recorded while a loop wraps is laid out in a straight line.
- Choosing an output needs Chrome or Edge. Hear yourself through the interface's direct monitoring; the app has no software monitor.
- Quick split resets the tempo to 100%.
- Quick split works on the mono mix and cannot isolate a single instrument; Instruments (Demucs) can.
- In a dense full mix the stretcher protects only the strongest attacks.
- The instrument splitter has to be started by hand in a terminal; the app cannot start it.
- A song started from nothing ("My recording") cannot be reopened after a reload.
