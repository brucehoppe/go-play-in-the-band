# Go Play in the Band

**[Try it in your browser →](https://brucehoppe.github.io/go-play-in-the-band/)** nothing to install; it runs on a built-in demo song.

Coded by Bruce Hoppe

> A **thought experiment and proof of concept**, not a finished product. It has passed automated
> tests but has not been judged by ear or tried on a real microphone. See [docs/STATUS.md](docs/STATUS.md).

A play-along practice app for guitarists: load a recording, turn the guitar down, loop a hard
section, slow it down, and record yourself with the band. TypeScript, plus Rust compiled to WebAssembly.

![The demo song: waveform, a four-bar loop, the band mixer with the guitar muted, speed at 75%](docs/screenshots/03-loop-mute-75.png)

More screenshots: [docs/screenshots](docs/screenshots). Retake them with `node scripts/screenshots.mjs`.

## Features

- **Play**: load WAV, MP3, FLAC or M4A; whole-song waveform; click to seek.
- **Loop**: drag IN/OUT, snap to bars, sample-accurate with a crossfade.
- **Mix**: a fader and mute per part; Mute / Quiet guide / Full presets for the guitar.
- **Slow down**: 25 to 125% at the same pitch, with the BPM you hear. Our own stretcher keeps each pick attack crisp.
- **Solo**: hear one part alone; slow it down to pick it out.
- **Record and overdub**: each take becomes a new part; Record with nothing loaded starts a song.
- **Audio devices**: record from a USB interface (Input 1, 2 or both); play through a USB headphone amp.
- **Song tools**: estimated tempo, first beat and key; editable tempo; click track.
- **Split**: right in the band panel. Quick split (drums-like, low bass, the rest) works anywhere.
- **Isolate the guitar**: Instruments splits a song into guitar, bass, drums, piano, vocals and other with Demucs, on your computer. Comes with the local app.
- **Export mix**: what you hear, as a WAV.
- **Private**: nothing you load leaves your computer. Works offline after one visit.

## Local app

One small program with the web app inside it. It opens in your browser. **Quit** on the page stops it; so does closing the page, after a couple of minutes.

    ./scripts/build.sh --install      # macOS: builds "Go Play in the Band.app" into ~/Applications
    .\scripts\build.ps1               # Windows: builds "Go Play in the Band.exe" into .\out

### Instrument splitter

The build also installs the instrument splitter, and the app starts and stops it for you. It is a
neural network (Demucs on PyTorch): about 1 GB, needs Python 3, and lives in `~/.go-play-in-the-band`,
which is why it sits beside the app rather than inside it. The browser demo cannot run it.

    ./scripts/build.sh --install --no-splitter   # leave it out (Windows: -NoSplitter)
    scripts/install.sh                           # add it later (Windows: scripts\install.ps1)
    scripts/run-server.sh                        # run it by hand, for the browser demo or npm run dev

## Develop

Needs Node.js 24+, Rust stable with the `wasm32-unknown-unknown` target, and `wasm-pack`.

    cd web
    npm install
    npm run dev
    npm test

## More

[Status](docs/STATUS.md) · [Changelog](CHANGELOG.md) · [Security](SECURITY.md) · [Design](docs/superpowers/specs/) · [Third-party notices](THIRD_PARTY_NOTICES.md)

MIT. See [LICENSE](LICENSE).
