# Go Play in the Band

**[Try it in your browser →](https://brucehoppe.github.io/go-play-in-the-band/)** nothing to install; it runs on a built-in demo song.

Coded by Bruce Hoppe

A play-along practice app for guitarists. Load a recording, turn the original guitar
down or out, loop a hard section, slow it down, and record yourself playing the part
against the rest of the band, so you feel like the guitarist in the band.

**Status: step 1 of 7.** Load a file (or the demo song), see the whole song as a
waveform, click to seek, play and pause. Loops, stems, speed, recording and export
are next; see `docs/superpowers/specs/`.

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
