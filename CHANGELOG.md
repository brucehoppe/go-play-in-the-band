# Changelog

This project is a thought experiment and proof of concept. Nothing here is a release.

## Unreleased

- Step 1: load a recording or the demo song, whole-song waveform (computed in Rust/WASM), click to seek, play/pause.
- Step 2: loop with IN/OUT handles, snap to bars, section chips, seamless sample-accurate looping with an 8 ms equal-power crossfade.
- Step 3a: multi-stem playback and the band mixer. The demo is a five-stem band; per-stem faders and mutes (10 ms smoothing), a YOUR PART guitar card with Mute / Quiet guide / Full presets, and loop waveform layers (band in amber, original guitar in teal, scaled by its level).
- Step 4: speed control (50/75/90/100%), pre-rendered with our own WSOLA time-stretcher in Rust/WASM in a worker.
- Step 5: record a take from the microphone (raw PCM, no processing), saved to IndexedDB; export the take mixed with the band as WAV.
- Optional local backend (`server/`, 127.0.0.1 only): `/health`, `/analyse`, `/separate` with a content-hash cache. Demucs and librosa are optional installs.
- Web app manifest.
- Latency calibration: a Calibrate button plays a click, records it on the mic, and shifts takes by the measured delay (stored in this browser).
- Opening a file uses the local backend when it is running, splitting it into parts (`GET /stems/{hash}/{name}` serves them); otherwise it stays one "Full mix".
- Service worker caches the demo for offline use; installer and run scripts for the backend (macOS and Windows).
- Stretcher match search made about 8x faster (a 4-minute song stretches in roughly 1 to 1.5 s natively).
- Docs: README marked as a thought-experiment POC, with what is and is not verified.
- Overdub: each recorded take becomes a new mixer part; Record with nothing loaded starts a song from your first take; "Export mix" exports every part at its level. Takes for a song are restored on reopen.
- Live demo fixed: the Pages deploy job now has `contents: read`; Pages enabled for the repository.
- Screenshots added under `docs/screenshots/`.
- Song tools, in `dsp-core` on `rustfft`: tempo, first-beat and key estimation for loaded recordings (so the bar grid and Snap to bars work on your own files), an editable tempo with ½× / 2×, a click-track part, and a quick split into percussive, bass and harmonic parts that add back up to the original. The bar grid now honours a first-downbeat offset.
- Security: `SECURITY.md`, weekly Dependabot updates (npm, cargo, pip, actions); on GitHub, secret scanning with push protection, private vulnerability reporting, CodeQL code scanning, and a ruleset protecting `main`.
- Local app (`desktop/`, Rust): the built web app embedded in one program, served on 127.0.0.1 only (host check, GET only), opened in your browser, and stopped by a heartbeat timeout. `scripts/build.sh` makes the macOS `.app`; `scripts/build.ps1` makes the Windows `.exe`. CI runs both.
- Docs: README cut down; detail moved to `docs/STATUS.md`.
- Split buttons live in the YOUR PART card (Quick split, Instruments); no more "see the README".
- Audio devices: choose the input (USB interface, Input 1 / Input 2 / both) and, in Chrome and Edge, the output (e.g. a USB headphone amp). Both inputs are now mixed to mono; before, only the left channel was recorded.
- Playback tempo slider, 50 to 125% in 5% steps, showing the BPM you hear; the Song tempo box is labelled as describing the song, not changing playback.
