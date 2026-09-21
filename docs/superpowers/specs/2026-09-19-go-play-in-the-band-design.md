# Go Play in the Band: design

A play-along practice app for guitarists. Load a recording, turn the original guitar
down or out, loop a hard section, slow it down, and record yourself against the rest
of the band. The full product brief is the user's prompt of 2026-09-19; this document
records the decisions made while designing it.

## Platforms

Windows and macOS. macOS alone is the fallback only if Windows proves impossible.
The browser app is platform-independent. The optional local backend is written with
`pathlib` and no shell-specific steps. CI runs on `windows-latest` and `macos-latest`.
The developer machine is a Mac, so Windows is verified in CI, not by hand.
Installers: `scripts/install.ps1` and `scripts/install.sh`.

## Languages and their jobs

| Language | Owns |
|---|---|
| TypeScript (React, Vite) | UI, transport, mixer, recording, IndexedDB, export, PWA |
| Rust → WASM (`dsp-core/`) | waveform peaks, WSOLA time-stretcher, loop crossfades, export mixdown |
| Python (FastAPI, optional, local-only, 127.0.0.1) | Demucs `htdemucs_6s` separation, beat/tempo detection, section estimation |

The stretcher is our own WSOLA in Rust, so the app stays MIT with no LGPL/GPL
question. Guitar quality at 50% and 75% is the risk: it is tested by ear, and
SoundTouch stays available behind the same interface as a fallback.

## Layout

```
go-play-in-the-band/
  web/        Vite + React + TypeScript (audio/, data/, ui/, state/, theme/)
  dsp-core/   Rust crate built with wasm-pack
  server/     FastAPI: /separate, /analyse, cache by content hash
  scripts/    install.ps1, install.sh
  docs/       specs, screenshots
  .github/workflows/  ci.yml, pages.yml
```

`web/src/data/` is the only module that talks to the server. Demo mode swaps in
bundled sample stems, so the UI runs as static files with relative paths, no
backend, no network and no keys. Controls that only make sense locally are hidden
in the demo.

## Audio engine

Stems are decoded to buffers and mixed in one AudioWorklet that owns the transport
clock in source-time samples. Per-stem gains are smoothed over about 10 ms, so a
slider change lands well inside 50 ms without clicks. The loop wraps sample-exactly
with a 5-10 ms equal-power crossfade. The count-in and click are generated on the
same clock.

Time-stretch is pre-rendered, not live: at 50/75/90% (and lazily the 5% ramp
steps) all stems are stretched offline in a Web Worker for the loop plus padding,
then played as ordinary buffers. This keeps gain changes instant, looping exact and
CPU low. The cost is a short "preparing 75%" wait the first time, and the result is
cached.

Recording captures raw PCM through an AudioWorklet with echo cancellation, noise
suppression and auto gain off, streamed to IndexedDB in chunks so long takes survive
a crash. Chunks are stamped on the same audio clock as the band, and a per-device
loopback calibration shifts takes into line. Take-plus-band export leaves mix
headroom so a full band and guitar do not clip.

## Carried over from minor-pentatonic-go

- Reuse and port to TypeScript: `rec-worklet.js`, `mp3-worker.js` with vendored
  lamejs (LGPL, listed in `THIRD_PARTY_NOTICES.md`), `looper.js`, `songs.js`.
- Strict CSP, no inline scripts, no external URLs, self-hosted fonts (both OFL),
  validated storage reads, tests that enforce these.
- MIT licence, README with the demo link above the install section, CHANGELOG,
  CONTRIBUTING, SECURITY, THIRD_PARTY_NOTICES.
- Pages workflow with SHA-pinned actions; it builds first and publishes `dist`.
- Public under `brucehoppe`, commits use the GitHub noreply address, and commits
  are pushed only when asked.
- Favour hands-on practice tools; no ear-training features.

## Build order and step 1

Follows the brief's seven steps. Step 1: scaffold `web/` with theme tokens and
fonts, decode WAV/MP3/FLAC/M4A, compute overview peaks in Rust/WASM off the main
thread (target under 3 s for 4 minutes), whole-song waveform with playhead and
click-to-seek, play/pause through the band worklet, header file card, demo-mode
stub and Pages workflow. Tests cover peaks and clock logic. Check in a real browser
for console errors. Then pause for review.

## As built (proof of concept)

This project is a thought experiment and proof of concept. The design above is the intent;
this section records where the build differs from it.

- Built: steps 1 to 3a, time-stretch (speed 50/75/90/100%), recording, latency calibration,
  WAV export of a take with the band, the optional backend, a service worker, installer scripts.
- Speed pre-renders the whole song per speed, not only the loop plus padding; it is fast
  enough (a few seconds for four minutes) and simpler. Each channel is stretched on its own.
- The stretcher's match search is coarse (every 2nd candidate, every 8th sample) for speed.
  Its effect on guitar quality is unheard.
- Takes are stored whole in IndexedDB, not streamed in chunks. Take export is WAV only; the
  lamejs MP3 encoder is not ported.
- The backend has `/health`, `/analyse` (tempo), `/separate` and `/stems/...`. Section
  estimation is not built. Demucs and librosa are optional installs.
- Not verified: quality by ear, a real microphone, real separation output, Windows by hand.
- The seven-step brief is not in the repo, so steps 3b to 7 are inferred from this spec.
- Overdub (added after the original design): a take is placed on the song timeline at the
  position recording started and added as a mono stem, reusing the multi-stem mixer. Takes
  recorded while a loop wraps are laid out linearly, not folded back onto the loop.
- Analysis moved into the browser (added after the original design): tempo, first beat and
  key are estimated in `dsp-core` on `rustfft` (spectral-flux onsets and autocorrelation;
  chroma against the Krumhansl profiles), so they no longer need the Python backend. The
  backend's `/analyse` remains but the app does not call it. The quick split is
  harmonic/percussive median filtering plus a 200 Hz bass cut, on the mono mix.
- Crates considered and not added: `symphonia` (the browser already decodes), `dasp` and
  `spectrum-analyzer` (nothing here needs them yet), `pitch-detection` (would suit a tuner or
  a note display, which is not built).
- Local app (added after the original design): `desktop/` is a std-only Rust server with
  `web/dist` embedded (`include_dir`), bound to 127.0.0.1:8766 (any free port if taken). It
  injects a `gpitb-local` meta tag so the page sends a heartbeat; the hosted demo never does.
  It exits 150 s after the last heartbeat. No Go, Electron or Tauri.
- Devices: the recorder asks for the chosen `deviceId` in stereo and picks Input 1 or 2 with a
  channel splitter (as minor-pentatonic-go does); output uses `AudioContext.setSinkId`. The
  choice is stored in localStorage and validated on read. Tempo is a 50 to 125% slider.

