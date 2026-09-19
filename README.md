# Go Play in the Band

**[Try it in your browser →](https://brucehoppe.github.io/go-play-in-the-band/)** nothing to install; it runs on a built-in demo song.

Coded by Bruce Hoppe

A play-along practice app for guitarists. Load a recording, turn the original guitar
down or out, loop a hard section, slow it down, and record yourself playing the part
against the rest of the band, so you feel like the guitarist in the band.

**Status: step 3a of 7: the band mixer (browser demo).** Load a file (or the demo song),
see the whole song as a waveform, click to seek, play and pause, and loop a section: drag
the IN/OUT handles (or nudge them with the arrow keys), snap them to bars, or click a
section chip. The demo song is a five-part band (guitar, bass, drums, keys, other), and the
"The band" panel has a fader and mute for each part. The guitar card, YOUR PART, has Mute,
Quiet guide and Full presets so you can turn the original guitar down or out and play it
yourself. Gain changes are smoothed over about 10 ms, so they never click. A loaded
file is a single "Full mix" for now; splitting it into parts needs the local backend, which
is the next step. Speed, recording and export come after; see `docs/superpowers/specs/`.

## Develop

Needs Node.js 24+, Rust (stable) with the `wasm32-unknown-unknown` target, and
`wasm-pack` (`cargo install wasm-pack`). Works on Windows and macOS.

    cd web
    npm install
    npm run dev        # builds the WASM core, then serves the app
    npm test           # unit tests
    cargo test --manifest-path ../dsp-core/Cargo.toml

Nothing you load leaves your computer.

## Licence

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
