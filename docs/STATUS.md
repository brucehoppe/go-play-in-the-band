# Status

A thought experiment and proof of concept. Expect rough edges.

## Checked

- Unit tests: web (Vitest), Rust (`dsp-core`, `desktop`), server (pytest). CI runs on macOS and Windows.
- Headless Chrome: the demo and real four-minute recordings load; speed, Record and overdub (fake
  microphone), song tools, quick split and the local app all run with no console errors.

## Not checked

- Nothing has been judged by ear: stretch quality at 25%, 50% and 75% (25% is likely to sound grainy), the quick split, the click track.
- No real microphone or USB interface (device picking was run against Chrome's fake devices): whether overdubs line up in time, and how good calibration is.
- Tempo can be out by a factor of two; the first beat may not be beat one; 4/4 is assumed.
- The Demucs backend has not been run on real audio.
- The Windows app is built in CI only, never run by hand. The Mac app has no icon and is not notarised.

## Known limits

- Recording works at 100% speed only. Use headphones, or the microphone re-records the band.
- A take recorded while a loop wraps is laid out in a straight line.
- Choosing an output needs Chrome or Edge. Hear yourself through the interface's direct monitoring; the app has no software monitor.
- Quick split resets the tempo to 100%.
- Quick split works on the mono mix and cannot isolate a single instrument.
- A song started from nothing ("My recording") cannot be reopened after a reload.
