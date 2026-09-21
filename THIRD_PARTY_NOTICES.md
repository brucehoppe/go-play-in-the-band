# Third-party notices

Go Play in the Band is MIT licensed (see [LICENSE](LICENSE)). It bundles three
typefaces through the `@fontsource` npm packages. Each is licensed under the
[SIL Open Font License 1.1](https://openfontlicense.org); the licence text ships
inside each package in `node_modules` and is copied next to the font files in
every build.

| Typeface | Used for | npm package |
|---|---|---|
| Bricolage Grotesque | headings | `@fontsource-variable/bricolage-grotesque` |
| IBM Plex Sans | interface text | `@fontsource/ibm-plex-sans` |
| IBM Plex Mono | times and numbers | `@fontsource/ibm-plex-mono` |

## Rust crates compiled into the WASM core

| Crate | Used for | Licence |
|---|---|---|
| `rustfft` (and its dependencies `num-complex`, `num-traits`, `num-integer`, `primal-check`, `strength_reduce`, `transpose`) | Fourier transforms for tempo, key and the quick split | MIT or Apache-2.0 |
| `wasm-bindgen` | the JavaScript bridge | MIT or Apache-2.0 |
| `include_dir` (local app only) | embedding the built web app in the program | MIT |

## Optional backend dependencies

The local backend (`server/`) uses FastAPI and Uvicorn. Stem separation and tempo
detection use Demucs and librosa, which are installed separately by the user and are not
bundled or distributed with this project. Check their own licences before redistributing
anything built with them.
