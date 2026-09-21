# Step 1: Load, Waveform, Play/Pause: Implementation Plan

> Historical: this plan was executed. Later steps have no separate plans; see the "As built" section of the design spec.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user can load an audio file (or a built-in demo song), see the whole song as a waveform computed in Rust/WASM, click to seek, and play/pause through an AudioWorklet, with the demo running as static files on GitHub Pages.

**Architecture:** `dsp-core/` (Rust) computes min/max waveform peaks and is compiled to WASM with `wasm-pack`. `web/` (Vite + React + TypeScript) decodes files with Web Audio, sends a mono mix to a Web Worker that calls the WASM peaks function, and plays audio through a `band-processor` AudioWorklet that owns the transport position in sample frames. All transport logic lives in a plain `Transport` class so it is unit-tested without a browser.

**Tech Stack:** Rust 2021 + wasm-bindgen + wasm-pack; TypeScript, React, Vite, Vitest; Web Audio API (AudioWorklet); GitHub Actions (windows-latest, macos-latest, ubuntu-latest for Pages).

**Spec:** `docs/superpowers/specs/2026-09-19-go-play-in-the-band-design.md`

## Global Constraints

- Platforms: Windows and macOS. CI runs on `windows-latest` and `macos-latest`. No shell-specific steps in scripts; workflow `run:` steps use `shell: bash`.
- Licence: MIT for our code. No GPL/LGPL code in the app itself. Fonts are OFL.
- UI runs as static files: `base: "./"` (relative paths), no server-only URLs, no network, no API keys.
- Strict CSP in production builds: no inline scripts or `on…=` handlers, no external URLs; fonts self-hosted through `@fontsource` packages.
- Theme: background `#16140F`, panels `#201D17`, raised `#2A261E`, borders `#2E2A22`, text `#F2ECE0`, secondary text `#A99F8C`, amber `#E8A93A` (band/loop/selected), teal `#6FB7A0` (original guitar), red `#C8412F` / `#E0533F` (user recording). Fonts: Bricolage Grotesque (display), IBM Plex Sans (UI), IBM Plex Mono (times, numbers).
- All touch targets at least 44px; real `<button>`s; visible focus rings; text contrast at least 4.5:1.
- Overview waveform for a 4-minute file appears in under 3 s.
- Commits: end each commit message with a second `-m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"`. The repo's local git email is already the brucehoppe noreply address; do not change it. **Commit after each task; never `git push`** unless the user says "push".
- Never delete files without listing them first; delete only files this plan created, by explicit name.
- Never bundle copyrighted audio. The demo song is synthesised in code.

## File Structure

```
.gitignore  LICENSE  README.md  CHANGELOG.md  THIRD_PARTY_NOTICES.md
dsp-core/Cargo.toml
dsp-core/src/lib.rs                 peaks: compute_peaks (plain fn) + peaks (wasm export)
web/package.json  tsconfig.json  vite.config.ts  index.html
web/src/vite-env.d.ts  main.tsx  App.tsx  types.ts
web/src/theme/tokens.css  app.css
web/src/lib/time.ts                 formatTime, xToSeconds
web/src/audio/mono.ts               mixToMono
web/src/audio/waveform.ts           pixelPeak, drawWaveform
web/src/audio/transport.ts          Transport (pure playback state + render)
web/src/audio/band.worklet.ts       AudioWorkletProcessor wrapping Transport
web/src/audio/engine.ts             Engine: AudioContext + worklet node facade
web/src/audio/peaks.worker.ts       worker calling WASM peaks
web/src/audio/peaks.ts              computePeaks(): promise wrapper for the worker
web/src/data/demo.ts                synthDemo(): the built-in demo song
web/src/ui/Header.tsx  SongPanel.tsx  TransportBar.tsx
web/src/**/*.test.ts                unit tests next to the code
.github/workflows/ci.yml  pages.yml
```

Zustand (named in the spec) is not added yet. Step 1 has one small piece of shared state, kept in `App`; add a store in step 2 when loops arrive.

---

### Task 1: Repo hygiene files

**Files:**
- Create: `.gitignore`, `LICENSE`, `README.md`, `CHANGELOG.md`, `THIRD_PARTY_NOTICES.md`

**Interfaces:**
- Produces: nothing code-facing; later tasks rely on `.gitignore` ignoring `web/src/wasm/`, `web/dist/`, `web/node_modules/`, `dsp-core/target/`, `dsp-core/pkg/`.

- [ ] **Step 1: Write `.gitignore`**

```gitignore
# Build output
dsp-core/target/
dsp-core/pkg/
web/src/wasm/
web/dist/
web/node_modules/

# Python (server, later)
__pycache__/
.venv/

# macOS / Windows
.DS_Store
Thumbs.db

# Raw recordings and local-only work files
*.wav
brag-output*/
```

- [ ] **Step 2: Write `LICENSE`** (MIT)

```text
MIT License

Copyright (c) 2026 Bruce Hoppe

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 3: Write `README.md`**

```markdown
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
```

- [ ] **Step 4: Write `CHANGELOG.md` and `THIRD_PARTY_NOTICES.md`**

`CHANGELOG.md`:

```markdown
# Changelog

## Unreleased

- Step 1: load a recording or the demo song, whole-song waveform (computed in Rust/WASM), click to seek, play/pause.
```

`THIRD_PARTY_NOTICES.md`:

```markdown
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
```

- [ ] **Step 5: Commit**

```bash
git add .gitignore LICENSE README.md CHANGELOG.md THIRD_PARTY_NOTICES.md
git commit -m "Add licence, README, changelog and notices" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `dsp-core` peaks in Rust

**Files:**
- Create: `dsp-core/Cargo.toml`, `dsp-core/src/lib.rs`

**Interfaces:**
- Produces (Rust): `pub fn compute_peaks(samples: &[f32], buckets: usize) -> Vec<f32>` returning `2 * buckets` values, `[min0, max0, min1, max1, …]`; and the wasm export `peaks(samples: &[f32], buckets: u32) -> Vec<f32>` (JS: `peaks(Float32Array, number): Float32Array`), same layout.

- [ ] **Step 1: Write `dsp-core/Cargo.toml`**

```toml
[package]
name = "dsp-core"
version = "0.1.0"
edition = "2021"
license = "MIT"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
wasm-bindgen = "0.2"

[profile.release]
opt-level = 3
lto = true
```

- [ ] **Step 2: Write the failing tests** in `dsp-core/src/lib.rs`

```rust
//! DSP core for Go Play in the Band. Compiled to WASM for the browser and tested natively.

/// Sample range covered by bucket `b` when `n` samples are split into `buckets`.
/// Uses u64 because `b * n` overflows a 32-bit usize (wasm32) for long files.
fn bucket_range(b: usize, n: usize, buckets: usize) -> (usize, usize) {
    todo!()
}

/// Min and max of each bucket: `[min0, max0, min1, max1, ...]`, length `2 * buckets`.
pub fn compute_peaks(samples: &[f32], buckets: usize) -> Vec<f32> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input_gives_zeros() {
        assert_eq!(compute_peaks(&[], 3), vec![0.0; 6]);
    }

    #[test]
    fn zero_buckets_gives_empty() {
        assert!(compute_peaks(&[0.5, -0.5], 0).is_empty());
    }

    #[test]
    fn min_and_max_per_bucket() {
        let s = [0.1, -0.5, 0.9, 0.2, -0.3, 0.4, 0.0, 0.0];
        assert_eq!(compute_peaks(&s, 2), vec![-0.5, 0.9, -0.3, 0.4]);
    }

    #[test]
    fn more_buckets_than_samples_still_covers_every_bucket() {
        let out = compute_peaks(&[0.25, -0.75], 4);
        assert_eq!(out.len(), 8);
        // every bucket holds at least one sample, so min <= max and nothing is infinite
        for pair in out.chunks(2) {
            assert!(pair[0] <= pair[1]);
            assert!(pair[0].is_finite() && pair[1].is_finite());
        }
    }

    #[test]
    fn buckets_partition_the_input_without_gaps() {
        let (n, buckets) = (1000, 7);
        let mut next = 0;
        for b in 0..buckets {
            let (start, end) = bucket_range(b, n, buckets);
            assert_eq!(start, next);
            assert!(end > start);
            next = end;
        }
        assert_eq!(next, n);
    }

    #[test]
    fn bucket_range_does_not_overflow_for_a_fifteen_minute_file() {
        // 15 min at 48 kHz = 43.2M samples; 2048 buckets: b * n exceeds u32::MAX.
        let n = 15 * 60 * 48_000;
        let (start, end) = bucket_range(2047, n, 2048);
        assert!(start < end && end == n);
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cargo test --manifest-path dsp-core/Cargo.toml`
Expected: FAIL (panics with `not yet implemented`).

- [ ] **Step 4: Implement**

Replace the two `todo!()` bodies and add the wasm export above `#[cfg(test)]`:

```rust
fn bucket_range(b: usize, n: usize, buckets: usize) -> (usize, usize) {
    let start = (b as u64 * n as u64 / buckets as u64) as usize;
    let end = ((b as u64 + 1) * n as u64 / buckets as u64) as usize;
    (start, end.max(start + 1).min(n))
}

pub fn compute_peaks(samples: &[f32], buckets: usize) -> Vec<f32> {
    let mut out = vec![0.0f32; buckets * 2];
    if samples.is_empty() || buckets == 0 {
        return out;
    }
    for b in 0..buckets {
        let (start, end) = bucket_range(b, samples.len(), buckets);
        let (mut lo, mut hi) = (f32::INFINITY, f32::NEG_INFINITY);
        for &s in &samples[start..end] {
            if s < lo {
                lo = s;
            }
            if s > hi {
                hi = s;
            }
        }
        out[2 * b] = lo;
        out[2 * b + 1] = hi;
    }
    out
}

use wasm_bindgen::prelude::*;

/// Browser entry point: `peaks(Float32Array, buckets) -> Float32Array`.
#[wasm_bindgen]
pub fn peaks(samples: &[f32], buckets: u32) -> Vec<f32> {
    compute_peaks(samples, buckets as usize)
}
```

- [ ] **Step 5: Run tests and the WASM build**

Run: `cargo test --manifest-path dsp-core/Cargo.toml`
Expected: `6 passed`.

Run: `wasm-pack build dsp-core --target web --out-dir ../web/src/wasm --release`
Expected: finishes with `Your wasm pkg is ready`, and `web/src/wasm/dsp_core.js` and `dsp_core_bg.wasm` exist (that folder is gitignored).

- [ ] **Step 6: Commit**

```bash
git add dsp-core/Cargo.toml dsp-core/src/lib.rs
git commit -m "Add dsp-core peaks (Rust, WASM export)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Web scaffold, theme and fonts

**Files:**
- Create: `web/package.json` (via npm), `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`, `web/src/vite-env.d.ts`, `web/src/main.tsx`, `web/src/theme/tokens.css`, `web/src/theme/app.css`, `web/src/App.tsx` (placeholder)

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `test`, `wasm`; CSS custom properties `--bg --panel --raised --border --text --text-2 --amber --teal --red --red-2 --font-display --font-ui --font-mono`.

- [ ] **Step 1: Install dependencies**

```bash
cd web
npm init -y
npm install react react-dom @fontsource-variable/bricolage-grotesque @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono
npm install -D vite @vitejs/plugin-react typescript vitest @types/react @types/react-dom
```

(Run `npm init -y` inside a folder named `web`, so the `web/` directory must be created first: `mkdir web && cd web`.)

- [ ] **Step 2: Set scripts and module type in `web/package.json`**

Edit the generated file so it contains these keys (keep the generated `dependencies`/`devDependencies`; set `"name": "go-play-in-the-band-web"`, `"private": true`, `"type": "module"`, and remove `"main"`):

```json
"scripts": {
  "wasm": "wasm-pack build ../dsp-core --target web --out-dir ../web/src/wasm --release",
  "dev": "npm run wasm && vite",
  "build": "npm run wasm && tsc --noEmit && vite build",
  "preview": "vite preview",
  "test": "vitest run"
}
```

- [ ] **Step 3: Write `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Write `web/vite.config.ts`**

```ts
import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";

// Production-only Content-Security-Policy. Dev is left open because Vite's
// dev server injects inline scripts for hot reload.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function cspPlugin(): Plugin {
  return {
    name: "csp",
    apply: "build",
    transformIndexHtml: (html) =>
      html.replace("<!--csp-->", `<meta http-equiv="Content-Security-Policy" content="${csp}" />`),
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), cspPlugin()],
  worker: { format: "es" },
  build: { assetsInlineLimit: 0 },
  test: { environment: "node" },
});
```

- [ ] **Step 5: Write `web/index.html`, `web/src/vite-env.d.ts`, `web/src/main.tsx`**

`web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <!--csp-->
    <title>Go Play in the Band</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`web/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

`web/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./theme/tokens.css";
import "./theme/app.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 6: Write the theme**

`web/src/theme/tokens.css`:

```css
:root {
  --bg: #16140f;
  --panel: #201d17;
  --raised: #2a261e;
  --border: #2e2a22;
  --text: #f2ece0;
  --text-2: #a99f8c;
  --amber: #e8a93a;
  --teal: #6fb7a0;
  --red: #c8412f;
  --red-2: #e0533f;
  --font-display: "Bricolage Grotesque Variable", system-ui, sans-serif;
  --font-ui: "IBM Plex Sans", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
  color-scheme: dark;
}
```

`web/src/theme/app.css`:

```css
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--font-ui); }
h1, h2 { font-family: var(--font-display); margin: 0; }
button {
  font: inherit; color: var(--text); background: var(--raised);
  border: 1px solid var(--border); border-radius: 8px;
  min-height: 44px; min-width: 44px; padding: 0 16px; cursor: pointer;
}
button:hover:not(:disabled) { border-color: var(--amber); }
button:disabled { opacity: 0.5; cursor: not-allowed; }
:focus-visible { outline: 3px solid var(--amber); outline-offset: 2px; }
.mono { font-family: var(--font-mono); }

.app { display: grid; grid-template-rows: auto 1fr auto; min-height: 100vh; }
.header {
  display: flex; flex-wrap: wrap; align-items: center; gap: 16px;
  padding: 12px 24px; border-bottom: 1px solid var(--border); background: var(--panel);
}
.header h1 { font-size: 1.4rem; margin-right: auto; }
.filecard { display: flex; flex-wrap: wrap; gap: 4px 16px; color: var(--text-2); font-size: 0.9rem; }
.filecard strong { color: var(--text); font-weight: 600; }
.main { padding: 24px; max-width: 1400px; width: 100%; margin: 0 auto; }
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
.panel h2 { font-size: 1rem; color: var(--text-2); margin-bottom: 12px; }
.empty { color: var(--text-2); }
.error { color: var(--red-2); margin-top: 12px; }

.wave {
  position: relative; height: 140px; background: var(--bg);
  border: 1px solid var(--border); border-radius: 8px; cursor: pointer; touch-action: none;
}
.wave canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.playhead { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--text); pointer-events: none; }

.transport {
  display: flex; align-items: center; gap: 16px; padding: 12px 24px;
  border-top: 1px solid var(--border); background: var(--panel);
}
.transport .time { font-family: var(--font-mono); font-size: 1.1rem; margin-right: auto; }
.transport .play { min-width: 64px; min-height: 64px; border-radius: 50%; background: var(--amber); color: #16140f; font-weight: 600; }
```

- [ ] **Step 7: Placeholder `web/src/App.tsx`**

```tsx
export function App() {
  return <h1>Go Play in the Band</h1>;
}
```

- [ ] **Step 8: Verify the scaffold builds**

Run (from `web/`): `npm run build`
Expected: `wasm-pack` succeeds, `tsc` prints nothing, Vite prints `built in …` and creates `web/dist/`. Open `web/dist/index.html` source and confirm the CSP `<meta>` is present.

- [ ] **Step 9: Commit**

```bash
git add web/package.json web/package-lock.json web/tsconfig.json web/vite.config.ts web/index.html web/src
git commit -m "Scaffold web app: Vite, React, TypeScript, theme, fonts, CSP" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Pure helpers (time, mono mix, waveform mapping)

**Files:**
- Create: `web/src/lib/time.ts`, `web/src/lib/time.test.ts`, `web/src/audio/mono.ts`, `web/src/audio/mono.test.ts`, `web/src/audio/waveform.ts`, `web/src/audio/waveform.test.ts`

**Interfaces:**
- Produces:
  - `formatTime(sec: number): string` → `"m:ss.t"` (e.g. `"1:05.2"`); invalid or negative → `"0:00.0"`.
  - `xToSeconds(x: number, width: number, duration: number): number` clamped to `[0, duration]`.
  - `mixToMono(channels: Float32Array[]): Float32Array` (always a new array).
  - `pixelPeak(peaks: Float32Array, x: number, width: number): [number, number]` (min, max for pixel column `x`).
  - `drawWaveform(ctx: CanvasRenderingContext2D, peaks: Float32Array, width: number, height: number, color: string): void`.

- [ ] **Step 1: Write the failing tests**

`web/src/lib/time.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatTime, xToSeconds } from "./time";

describe("formatTime", () => {
  it("formats zero", () => expect(formatTime(0)).toBe("0:00.0"));
  it("formats minutes, seconds and tenths", () => expect(formatTime(65.25)).toBe("1:05.2"));
  it("clamps negatives and non-finite to zero", () => {
    expect(formatTime(-3)).toBe("0:00.0");
    expect(formatTime(Number.NaN)).toBe("0:00.0");
  });
});

describe("xToSeconds", () => {
  it("maps the left edge, middle and right edge", () => {
    expect(xToSeconds(0, 200, 60)).toBe(0);
    expect(xToSeconds(100, 200, 60)).toBe(30);
    expect(xToSeconds(200, 200, 60)).toBe(60);
  });
  it("clamps outside the width", () => {
    expect(xToSeconds(-10, 200, 60)).toBe(0);
    expect(xToSeconds(999, 200, 60)).toBe(60);
  });
  it("returns 0 for a zero-width element", () => expect(xToSeconds(5, 0, 60)).toBe(0));
});
```

`web/src/audio/mono.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mixToMono } from "./mono";

describe("mixToMono", () => {
  it("averages channels", () => {
    const out = mixToMono([Float32Array.of(1, 1), Float32Array.of(-1, 1)]);
    expect(Array.from(out)).toEqual([0, 1]);
  });
  it("returns a copy for a single channel", () => {
    const src = Float32Array.of(0.5, -0.5);
    const out = mixToMono([src]);
    expect(Array.from(out)).toEqual([0.5, -0.5]);
    expect(out).not.toBe(src);
  });
  it("returns an empty array for no channels", () => expect(mixToMono([]).length).toBe(0));
});
```

`web/src/audio/waveform.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pixelPeak } from "./waveform";

// 4 buckets: [min, max] pairs
const peaks = Float32Array.of(-1, 1, -0.5, 0.5, -0.2, 0.2, 0, 0);

describe("pixelPeak", () => {
  it("merges buckets when there are more buckets than pixels", () => {
    expect(pixelPeak(peaks, 0, 2)).toEqual([-1, 1]);
    const [lo, hi] = pixelPeak(peaks, 1, 2);
    expect(lo).toBeCloseTo(-0.2);
    expect(hi).toBeCloseTo(0.2);
  });
  it("uses one bucket per pixel when there are more pixels than buckets", () => {
    expect(pixelPeak(peaks, 0, 8)).toEqual([-1, 1]);
    expect(pixelPeak(peaks, 1, 8)).toEqual([-1, 1]);
    expect(pixelPeak(peaks, 2, 8)).toEqual([-0.5, 0.5]);
  });
  it("returns [0, 0] for empty peaks", () => expect(pixelPeak(new Float32Array(0), 0, 10)).toEqual([0, 0]));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `web/`): `npx vitest run`
Expected: FAIL, "Failed to resolve import" for `./time`, `./mono`, `./waveform`.

- [ ] **Step 3: Implement**

`web/src/lib/time.ts`:

```ts
/** "m:ss.t" for a time in seconds. Invalid or negative input gives "0:00.0". */
export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const tenths = Math.floor(sec * 10);
  const m = Math.floor(tenths / 600);
  const s = Math.floor((tenths % 600) / 10);
  const t = tenths % 10;
  return `${m}:${String(s).padStart(2, "0")}.${t}`;
}

/** Horizontal position inside an element to a time in the song, clamped to the song. */
export function xToSeconds(x: number, width: number, duration: number): number {
  if (width <= 0) return 0;
  return Math.min(1, Math.max(0, x / width)) * duration;
}
```

`web/src/audio/mono.ts`:

```ts
/** Average all channels into one new mono array. */
export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0].slice();
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i];
  const k = 1 / channels.length;
  for (let i = 0; i < n; i++) out[i] *= k;
  return out;
}
```

`web/src/audio/waveform.ts`:

```ts
/** Min and max for pixel column `x` of `width`, from interleaved [min, max] peaks. */
export function pixelPeak(peaks: Float32Array, x: number, width: number): [number, number] {
  const buckets = peaks.length / 2;
  const b0 = Math.floor((x * buckets) / width);
  const b1 = Math.max(b0 + 1, Math.floor(((x + 1) * buckets) / width));
  let lo = Infinity;
  let hi = -Infinity;
  for (let b = b0; b < Math.min(b1, buckets); b++) {
    lo = Math.min(lo, peaks[2 * b]);
    hi = Math.max(hi, peaks[2 * b + 1]);
  }
  return lo === Infinity ? [0, 0] : [lo, hi];
}

/** Draw the overview waveform as one vertical bar per pixel column. */
export function drawWaveform(
  ctx: CanvasRenderingContext2D,
  peaks: Float32Array,
  width: number,
  height: number,
  color: string,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = color;
  const mid = height / 2;
  for (let x = 0; x < width; x++) {
    const [lo, hi] = pixelPeak(peaks, x, width);
    const y0 = mid - hi * mid;
    const y1 = mid - lo * mid;
    ctx.fillRect(x, y0, 1, Math.max(1, y1 - y0));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run`
Expected: all tests in the three files PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib web/src/audio/mono.ts web/src/audio/mono.test.ts web/src/audio/waveform.ts web/src/audio/waveform.test.ts
git commit -m "Add time, mono-mix and waveform helpers with tests" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Transport and the band worklet

**Files:**
- Create: `web/src/audio/transport.ts`, `web/src/audio/transport.test.ts`, `web/src/audio/band.worklet.ts`

**Interfaces:**
- Produces:
  - `class Transport { constructor(length: number); length: number; position: number; playing: boolean; play(): void; pause(): void; seek(frame: number): void; render(src: Float32Array[], out: Float32Array[]): void }`. `render` fills every `out` channel for one block: copies from `src` (a mono source feeds all outputs) while playing, advances `position`, zero-fills the remainder, and stops at the end. If `play()` is called at the end, `position` restarts at 0.
  - Worklet messages: `type BandCommand = {type:"load"; channels: Float32Array[]} | {type:"play"} | {type:"pause"} | {type:"seek"; frame: number}` and `type BandEvent = {type:"position"; frame: number; playing: boolean}`, both exported from `band.worklet.ts`. Registered processor name: `"band-processor"`.

- [ ] **Step 1: Write the failing tests** `web/src/audio/transport.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { Transport } from "./transport";

const src = [Float32Array.from({ length: 10 }, (_, i) => i + 1)]; // 1..10

function block(n: number, channels = 1): Float32Array[] {
  return Array.from({ length: channels }, () => new Float32Array(n).fill(-9));
}

describe("Transport", () => {
  it("outputs silence and stays put while paused", () => {
    const t = new Transport(10);
    const out = block(4);
    t.render(src, out);
    expect(Array.from(out[0])).toEqual([0, 0, 0, 0]);
    expect(t.position).toBe(0);
  });

  it("copies source frames and advances while playing", () => {
    const t = new Transport(10);
    t.play();
    const out = block(4);
    t.render(src, out);
    expect(Array.from(out[0])).toEqual([1, 2, 3, 4]);
    expect(t.position).toBe(4);
    expect(t.playing).toBe(true);
  });

  it("zero-fills and stops at the end of the song", () => {
    const t = new Transport(10);
    t.play();
    t.render(src, block(8));
    const out = block(8);
    t.render(src, out);
    expect(Array.from(out[0])).toEqual([9, 10, 0, 0, 0, 0, 0, 0]);
    expect(t.position).toBe(10);
    expect(t.playing).toBe(false);
  });

  it("restarts from the top when played at the end", () => {
    const t = new Transport(10);
    t.seek(10);
    t.play();
    expect(t.position).toBe(0);
    expect(t.playing).toBe(true);
  });

  it("clamps seeks to the song", () => {
    const t = new Transport(10);
    t.seek(-5);
    expect(t.position).toBe(0);
    t.seek(999);
    expect(t.position).toBe(10);
    t.seek(3.9);
    expect(t.position).toBe(3);
  });

  it("feeds a mono source to every output channel", () => {
    const t = new Transport(10);
    t.play();
    const out = block(3, 2);
    t.render(src, out);
    expect(Array.from(out[0])).toEqual([1, 2, 3]);
    expect(Array.from(out[1])).toEqual([1, 2, 3]);
  });

  it("pause keeps the position", () => {
    const t = new Transport(10);
    t.play();
    t.render(src, block(4));
    t.pause();
    t.render(src, block(4));
    expect(t.position).toBe(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/audio/transport.test.ts`
Expected: FAIL, cannot resolve `./transport`.

- [ ] **Step 3: Implement `web/src/audio/transport.ts`**

```ts
/**
 * Playback state for one song, in sample frames. Pure logic with no Web Audio
 * dependency, so it is unit-tested directly and wrapped by the AudioWorklet.
 */
export class Transport {
  position = 0;
  playing = false;

  constructor(public length: number) {}

  play(): void {
    if (this.position >= this.length) this.position = 0;
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  seek(frame: number): void {
    this.position = Math.max(0, Math.min(this.length, Math.floor(frame)));
  }

  /** Fill one output block. A source with fewer channels than `out` feeds its last channel to the rest. */
  render(src: Float32Array[], out: Float32Array[]): void {
    const n = out[0].length;
    if (!this.playing) {
      for (const o of out) o.fill(0);
      return;
    }
    const written = Math.min(n, Math.max(0, this.length - this.position));
    for (let c = 0; c < out.length; c++) {
      const s = src[Math.min(c, src.length - 1)];
      out[c].set(s.subarray(this.position, this.position + written));
      out[c].fill(0, written);
    }
    this.position += written;
    if (this.position >= this.length) this.playing = false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/audio/transport.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Write `web/src/audio/band.worklet.ts`**

The AudioWorklet global scope is not in TypeScript's DOM lib, so declare the few names we use. If `tsc` later reports a duplicate identifier for `AudioWorkletProcessor` or `registerProcessor`, delete our `declare` for that name; newer TypeScript DOM libs include it.

```ts
import { Transport } from "./transport";

export type BandCommand =
  | { type: "load"; channels: Float32Array[] }
  | { type: "play" }
  | { type: "pause" }
  | { type: "seek"; frame: number };

export type BandEvent = { type: "position"; frame: number; playing: boolean };

interface WorkletPort {
  onmessage: ((e: MessageEvent<BandCommand>) => void) | null;
  postMessage(message: BandEvent): void;
}
declare const AudioWorkletProcessor: { new (): { readonly port: WorkletPort } };
declare function registerProcessor(name: string, ctor: new () => object): void;

/** Report the position about every 1024 frames (~21 ms at 48 kHz), and on every state change. */
const REPORT_EVERY = 1024;

class BandProcessor extends AudioWorkletProcessor {
  private transport = new Transport(0);
  private src: Float32Array[] = [new Float32Array(0)];
  private sinceReport = 0;
  private lastPlaying = false;

  constructor() {
    super();
    this.port.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "load") {
        this.src = msg.channels;
        this.transport = new Transport(msg.channels[0].length);
      } else if (msg.type === "play") this.transport.play();
      else if (msg.type === "pause") this.transport.pause();
      else if (msg.type === "seek") this.transport.seek(msg.frame);
      this.report();
    };
  }

  private report(): void {
    this.sinceReport = 0;
    this.lastPlaying = this.transport.playing;
    this.port.postMessage({ type: "position", frame: this.transport.position, playing: this.transport.playing });
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    this.transport.render(this.src, out);
    this.sinceReport += out[0].length;
    if (this.sinceReport >= REPORT_EVERY || this.transport.playing !== this.lastPlaying) this.report();
    return true;
  }
}

registerProcessor("band-processor", BandProcessor);
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output. (Earlier tasks' `src/wasm` does not need to exist yet because nothing imports it.)

- [ ] **Step 7: Commit**

```bash
git add web/src/audio/transport.ts web/src/audio/transport.test.ts web/src/audio/band.worklet.ts
git commit -m "Add Transport and the band AudioWorklet" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Engine, decoding and the peaks worker

**Files:**
- Create: `web/src/audio/engine.ts`, `web/src/audio/peaks.worker.ts`, `web/src/audio/peaks.ts`

**Interfaces:**
- Consumes: `BandCommand`, `BandEvent` from `band.worklet.ts`; WASM `peaks` from `web/src/wasm/dsp_core.js` (built by `npm run wasm`).
- Produces:
  - `class Engine { onPosition: (seconds: number, playing: boolean) => void; readonly sampleRate: number; init(): Promise<void>; decode(file: File): Promise<Float32Array[]>; load(channels: Float32Array[]): void; play(): Promise<void>; pause(): void; seek(seconds: number): void }`
  - `computePeaks(mono: Float32Array, buckets: number): Promise<Float32Array>` (transfers `mono`, so the caller must not use it afterwards).

These need a browser (AudioContext, Worker, WASM), so they are verified in Task 10 rather than unit-tested.

- [ ] **Step 1: Write `web/src/audio/peaks.worker.ts`**

```ts
import init, { peaks } from "../wasm/dsp_core.js";

const ready = init();

self.onmessage = async (e: MessageEvent<{ id: number; mono: Float32Array; buckets: number }>) => {
  await ready;
  const out = peaks(e.data.mono, e.data.buckets);
  (self as unknown as Worker).postMessage({ id: e.data.id, peaks: out }, [out.buffer]);
};
```

- [ ] **Step 2: Write `web/src/audio/peaks.ts`**

```ts
let worker: Worker | null = null;
let nextId = 0;

/** Overview peaks ([min, max] pairs) computed in Rust/WASM off the main thread. Transfers `mono`. */
export function computePeaks(mono: Float32Array, buckets: number): Promise<Float32Array> {
  worker ??= new Worker(new URL("./peaks.worker.ts", import.meta.url), { type: "module" });
  const w = worker;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<{ id: number; peaks: Float32Array }>) => {
      if (e.data.id !== id) return;
      w.removeEventListener("message", onMessage);
      resolve(e.data.peaks);
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", (e) => reject(e.error ?? new Error("Waveform worker failed")), { once: true });
    w.postMessage({ id, mono, buckets }, [mono.buffer]);
  });
}
```

- [ ] **Step 3: Write `web/src/audio/engine.ts`**

```ts
import bandWorkletUrl from "./band.worklet.ts?worker&url";
import type { BandCommand, BandEvent } from "./band.worklet";

export class Engine {
  private ctx = new AudioContext({ latencyHint: "interactive" });
  private node: AudioWorkletNode | null = null;

  onPosition: (seconds: number, playing: boolean) => void = () => {};

  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  async init(): Promise<void> {
    if (this.node) return;
    await this.ctx.audioWorklet.addModule(bandWorkletUrl);
    const node = new AudioWorkletNode(this.ctx, "band-processor", { outputChannelCount: [2] });
    node.connect(this.ctx.destination);
    node.port.onmessage = (e: MessageEvent<BandEvent>) =>
      this.onPosition(e.data.frame / this.ctx.sampleRate, e.data.playing);
    this.node = node;
  }

  /** Decode an audio file at the context's sample rate. Format support is the browser's. */
  async decode(file: File): Promise<Float32Array[]> {
    let buffer: AudioBuffer;
    try {
      buffer = await this.ctx.decodeAudioData(await file.arrayBuffer());
    } catch {
      throw new Error(`Could not read "${file.name}". Try a WAV, MP3, FLAC or M4A file.`);
    }
    return Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c).slice());
  }

  /** Hand the song to the worklet. The engine posts copies, so the caller keeps its arrays. */
  load(channels: Float32Array[]): void {
    const copies = channels.map((c) => c.slice());
    this.send({ type: "load", channels: copies }, copies.map((c) => c.buffer));
  }

  async play(): Promise<void> {
    await this.ctx.resume();
    this.send({ type: "play" });
  }

  pause(): void {
    this.send({ type: "pause" });
  }

  seek(seconds: number): void {
    this.send({ type: "seek", frame: seconds * this.ctx.sampleRate });
  }

  private send(cmd: BandCommand, transfer: Transferable[] = []): void {
    this.node?.port.postMessage(cmd, transfer);
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run wasm && npx tsc --noEmit`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add web/src/audio/engine.ts web/src/audio/peaks.worker.ts web/src/audio/peaks.ts
git commit -m "Add audio engine, file decoding and the WASM peaks worker" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: The built-in demo song

**Files:**
- Create: `web/src/data/demo.ts`, `web/src/data/demo.test.ts`, `web/src/types.ts`

**Interfaces:**
- Produces:
  - `synthDemo(sampleRate: number, bars?: number): Float32Array[]` returns two identical channels, deterministic, peak at most 1. Default 16 bars.
  - `DEMO_INFO = { name: "Demo: A minor jam", bpm: 100, timeSig: "4/4", key: "A minor" }`.
  - `interface SongInfo { name: string; duration: number; bpm: number | null; timeSig: string | null; key: string | null; stemCount: number }` in `types.ts`.

- [ ] **Step 1: Write the failing tests** `web/src/data/demo.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { synthDemo } from "./demo";

describe("synthDemo", () => {
  const sr = 8000;
  const ch = synthDemo(sr, 2);

  it("makes two channels of the expected length (2 bars of 4 beats at 100 bpm)", () => {
    expect(ch).toHaveLength(2);
    expect(ch[0].length).toBe(Math.floor(2 * 4 * 0.6 * sr));
  });

  it("is audible and never clips", () => {
    let peak = 0;
    for (const v of ch[0]) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThanOrEqual(1);
  });

  it("is deterministic", () => {
    expect(Array.from(synthDemo(sr, 2)[0].slice(0, 500))).toEqual(Array.from(ch[0].slice(0, 500)));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/data/demo.test.ts`
Expected: FAIL, cannot resolve `./demo`.

- [ ] **Step 3: Implement**

`web/src/types.ts`:

```ts
export interface SongInfo {
  name: string;
  duration: number;
  bpm: number | null;
  timeSig: string | null;
  key: string | null;
  stemCount: number;
}
```

`web/src/data/demo.ts`:

```ts
export const DEMO_INFO = { name: "Demo: A minor jam", bpm: 100, timeSig: "4/4", key: "A minor" };

const BASS_HZ = [55, 55, 65.41, 49]; // A1 A1 C2 G1, one per bar

/**
 * A simple synthesised drum-and-bass groove, so the demo needs no audio files
 * (and no copyright). Kick on 1 and 3, snare on 2 and 4, eighth-note hats.
 */
export function synthDemo(sampleRate: number, bars = 16): Float32Array[] {
  const beat = 60 / DEMO_INFO.bpm;
  const total = Math.floor(bars * 4 * beat * sampleRate);
  const out = new Float32Array(total);
  let seed = 12345;
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed / 0xffffffff) * 2 - 1;
  };
  for (let i = 0; i < total; i++) {
    const t = i / sampleRate;
    const beatPos = t / beat;
    const beatIdx = Math.floor(beatPos) % 4;
    const bar = Math.floor(beatPos / 4);
    const inBeat = (beatPos % 1) * beat;
    const inEighth = ((beatPos * 2) % 1) * (beat / 2);
    let s = 0;
    if (beatIdx === 0 || beatIdx === 2) {
      const phase = 2 * Math.PI * (50 * inBeat + (80 / 30) * (1 - Math.exp(-30 * inBeat)));
      s += 0.6 * Math.sin(phase) * Math.exp(-inBeat * 8);
    } else {
      s += 0.35 * noise() * Math.exp(-inBeat * 18);
    }
    s += 0.12 * noise() * Math.exp(-inEighth * 90);
    s += 0.3 * Math.sin(2 * Math.PI * BASS_HZ[bar % 4] * t) * Math.exp(-inBeat * 2.5);
    out[i] = s * 0.7;
  }
  return [out, out.slice()];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run`
Expected: all test files PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/data web/src/types.ts
git commit -m "Add the synthesised demo song" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: The UI

**Files:**
- Modify: `web/src/App.tsx`
- Create: `web/src/ui/Header.tsx`, `web/src/ui/SongPanel.tsx`, `web/src/ui/TransportBar.tsx`

**Interfaces:**
- Consumes: `Engine`, `computePeaks`, `mixToMono`, `drawWaveform`, `formatTime`, `xToSeconds`, `synthDemo`, `DEMO_INFO`, `SongInfo`.
- Produces: `Header({song, busy, onPickFile, onLoadDemo})`, `SongPanel({peaks, duration, position, onSeek})`, `TransportBar({position, duration, playing, disabled, onToggle, onRewind})`.

- [ ] **Step 1: Write `web/src/ui/Header.tsx`**

```tsx
import { useRef } from "react";
import type { SongInfo } from "../types";
import { formatTime } from "../lib/time";

interface Props {
  song: SongInfo | null;
  busy: boolean;
  onPickFile: (file: File) => void;
  onLoadDemo: () => void;
}

const dash = (v: string | number | null) => (v === null ? "—" : String(v));

export function Header({ song, busy, onPickFile, onLoadDemo }: Props) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <header className="header">
      <h1>Go Play in the Band</h1>
      {song && (
        <div className="filecard" aria-label="Loaded recording">
          <strong>{song.name}</strong>
          <span className="mono">{formatTime(song.duration)}</span>
          <span>BPM <span className="mono">{dash(song.bpm)}</span></span>
          <span>Time <span className="mono">{dash(song.timeSig)}</span></span>
          <span>Key {dash(song.key)}</span>
          <span>{song.stemCount} part{song.stemCount === 1 ? " (full mix)" : "s"}</span>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="audio/*,.wav,.mp3,.flac,.m4a"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPickFile(file);
          e.target.value = "";
        }}
      />
      <button disabled={busy} onClick={() => input.current?.click()}>Load recording</button>
      <button disabled={busy} onClick={onLoadDemo}>Try the demo song</button>
    </header>
  );
}
```

- [ ] **Step 2: Write `web/src/ui/SongPanel.tsx`**

```tsx
import { useEffect, useRef } from "react";
import { drawWaveform } from "../audio/waveform";
import { xToSeconds } from "../lib/time";

interface Props {
  peaks: Float32Array | null;
  duration: number;
  position: number;
  onSeek: (seconds: number) => void;
}

const AMBER = "#e8a93a";
const STEP = 5; // seconds per arrow key

export function SongPanel({ peaks, duration, position, onSeek }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = box.current;
    const cv = canvas.current;
    if (!el || !cv || !peaks) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = el.getBoundingClientRect();
      cv.width = Math.max(1, Math.floor(width * dpr));
      cv.height = Math.max(1, Math.floor(height * dpr));
      drawWaveform(cv.getContext("2d")!, peaks, cv.width, cv.height, AMBER);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [peaks]);

  if (!peaks) {
    return (
      <section className="panel">
        <h2>Whole song</h2>
        <p className="empty">Load a recording, or try the demo song, to see the whole song here.</p>
      </section>
    );
  }

  const pct = duration > 0 ? (position / duration) * 100 : 0;
  return (
    <section className="panel">
      <h2>Whole song</h2>
      <div
        ref={box}
        className="wave"
        role="slider"
        tabIndex={0}
        aria-label="Song position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(position)}
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onSeek(xToSeconds(e.clientX - r.left, r.width, duration));
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") onSeek(Math.min(duration, position + STEP));
          else if (e.key === "ArrowLeft") onSeek(Math.max(0, position - STEP));
          else return;
          e.preventDefault();
        }}
      >
        <canvas ref={canvas} />
        <div className="playhead" style={{ left: `${pct}%` }} />
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Write `web/src/ui/TransportBar.tsx`**

```tsx
import { formatTime } from "../lib/time";

interface Props {
  position: number;
  duration: number;
  playing: boolean;
  disabled: boolean;
  onToggle: () => void;
  onRewind: () => void;
}

export function TransportBar({ position, duration, playing, disabled, onToggle, onRewind }: Props) {
  return (
    <footer className="transport">
      <div className="time" aria-live="off">
        {formatTime(position)} / {formatTime(duration)}
      </div>
      <button disabled={disabled} onClick={onRewind} aria-label="Back to start">⏮</button>
      <button className="play" disabled={disabled} onClick={onToggle} aria-label={playing ? "Pause" : "Play"}>
        {playing ? "❚❚" : "▶"}
      </button>
    </footer>
  );
}
```

- [ ] **Step 4: Replace `web/src/App.tsx`**

```tsx
import { useRef, useState } from "react";
import { Engine } from "./audio/engine";
import { mixToMono } from "./audio/mono";
import { computePeaks } from "./audio/peaks";
import { DEMO_INFO, synthDemo } from "./data/demo";
import type { SongInfo } from "./types";
import { Header } from "./ui/Header";
import { SongPanel } from "./ui/SongPanel";
import { TransportBar } from "./ui/TransportBar";

const PEAK_BUCKETS = 4096;

type Meta = Pick<SongInfo, "bpm" | "timeSig" | "key">;
const UNKNOWN: Meta = { bpm: null, timeSig: null, key: null };

export function App() {
  const engineRef = useRef<Engine | null>(null);
  const [song, setSong] = useState<SongInfo | null>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The AudioContext is created on the first click, which browsers require.
  function engine(): Engine {
    if (!engineRef.current) {
      const e = new Engine();
      e.onPosition = (s, p) => {
        setPosition(s);
        setPlaying(p);
      };
      engineRef.current = e;
    }
    return engineRef.current;
  }

  async function open(name: string, getChannels: (e: Engine) => Promise<Float32Array[]>, meta: Meta) {
    setBusy(true);
    setError(null);
    try {
      const e = engine();
      await e.init();
      e.pause();
      const channels = await getChannels(e);
      e.load(channels);
      const overview = await computePeaks(mixToMono(channels), PEAK_BUCKETS);
      setPeaks(overview);
      setSong({ name, duration: channels[0].length / e.sampleRate, ...meta, stemCount: 1 });
      setPosition(0);
      setPlaying(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong loading that recording.");
    } finally {
      setBusy(false);
    }
  }

  const openFile = (file: File) => open(file.name, (e) => e.decode(file), UNKNOWN);
  const openDemo = () =>
    open(DEMO_INFO.name, async (e) => synthDemo(e.sampleRate), {
      bpm: DEMO_INFO.bpm,
      timeSig: DEMO_INFO.timeSig,
      key: DEMO_INFO.key,
    });

  return (
    <div className="app">
      <Header song={song} busy={busy} onPickFile={openFile} onLoadDemo={openDemo} />
      <main className="main">
        <SongPanel
          peaks={peaks}
          duration={song?.duration ?? 0}
          position={position}
          onSeek={(s) => engine().seek(s)}
        />
        {busy && <p className="empty" role="status">Reading the recording…</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </main>
      <TransportBar
        position={position}
        duration={song?.duration ?? 0}
        playing={playing}
        disabled={!song || busy}
        onToggle={() => (playing ? engine().pause() : void engine().play())}
        onRewind={() => engine().seek(0)}
      />
    </div>
  );
}
```

- [ ] **Step 5: Typecheck and build**

Run: `npm run build`
Expected: no `tsc` errors and Vite reports `built in …`.

- [ ] **Step 6: Commit**

```bash
git add web/src/App.tsx web/src/ui
git commit -m "Add header, whole-song waveform panel and transport bar" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: CI and Pages workflows

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/pages.yml`

**Interfaces:**
- Produces: CI on `windows-latest` and `macos-latest` running Rust tests, the WASM build, web tests and the production build; Pages deploy of `web/dist` on push to `main`.

- [ ] **Step 1: Look up pinned action SHAs**

The four Pages actions were already pinned in the minor-pentatonic-go repo; reuse those exact SHAs (commit SHAs and version comments below). For `actions/setup-node` find the current commit:

Run: `git ls-remote https://github.com/actions/setup-node 'refs/tags/v6*'`
Take the SHA from the line ending in `^{}` (the peeled commit) for the highest `v6.x.y` tag; if the highest major tag is newer, use that. Put the SHA and tag in the `<SETUP_NODE_SHA>` and `<SETUP_NODE_TAG>` fields of both workflows below before saving.

- [ ] **Step 2: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    defaults:
      run:
        shell: bash
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@<SETUP_NODE_SHA> # <SETUP_NODE_TAG>
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: web/package-lock.json
      - name: Rust target and wasm-pack
        run: |
          rustup target add wasm32-unknown-unknown
          cargo install wasm-pack --locked
      - name: Rust tests
        run: cargo test --manifest-path dsp-core/Cargo.toml
      - name: Install web dependencies
        working-directory: web
        run: npm ci
      - name: Web tests
        working-directory: web
        run: npm test
      - name: Production build
        working-directory: web
        run: npm run build
```

- [ ] **Step 3: Write `.github/workflows/pages.yml`**

```yaml
name: Live demo

# Builds the web app (Rust/WASM core included) and publishes it to GitHub Pages.
# The demo needs no backend, network or keys: it runs on a synthesised song.
on:
  push:
    branches: [main]
    paths: ["web/**", "dsp-core/**", ".github/workflows/pages.yml"]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@<SETUP_NODE_SHA> # <SETUP_NODE_TAG>
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: web/package-lock.json
      - name: Rust target and wasm-pack
        run: |
          rustup target add wasm32-unknown-unknown
          cargo install wasm-pack --locked
      - name: Build
        working-directory: web
        run: |
          npm ci
          npm run build
      - uses: actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d # v6.0.0
      - uses: actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5.0.0
        with:
          path: web/dist
      - id: deployment
        uses: actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5.0.1
```

- [ ] **Step 4: Check no placeholder is left, then validate the YAML**

Run: `grep -n "<SETUP_NODE" .github/workflows/*.yml`
Expected: no output.

Run: `python3 -c "import yaml,glob; [yaml.safe_load(open(f)) for f in glob.glob('.github/workflows/*.yml')]; print('ok')"`
Expected: `ok` (if PyYAML is missing, `python3 -m pip install pyyaml` first).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows
git commit -m "Add CI (Windows and macOS) and the Pages demo workflow" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Verify in a real browser, then pause for review

**Files:** none (verification only; fix anything found in the task that owns the file).

- [ ] **Step 1: Run every automated check**

Run: `cargo test --manifest-path dsp-core/Cargo.toml && cd web && npm test && npm run build`
Expected: Rust 6 passed; Vitest all passed; build succeeds.

- [ ] **Step 2: Serve the production build and open it**

Run (from `web/`): `npx vite preview --port 4173` in the background, then open `http://localhost:4173/` in Chrome with the browser tools. The production build is the one with the strict CSP, so this also proves the CSP does not block the worker, WASM or worklet.

- [ ] **Step 3: Check the flow and the console**

1. Click **Try the demo song**. Expected: the header card shows `Demo: A minor jam`, `0:38.4`, BPM `100`, `4/4`, `A minor`, `1 part (full mix)`; an amber waveform appears.
2. Click the waveform near the middle. Expected: the playhead jumps there and the time updates.
3. Click **Play**. Expected: audio is heard (kick, snare, hats, bass), the playhead moves, the button becomes **Pause**; clicking it stops; **Back to start** returns to 0:00.0.
4. Let it play to the end. Expected: it stops and the button returns to **Play**.
5. Click **Load recording** and pick a real WAV/MP3 (choose a file you have and tell the user which). Expected: waveform appears, and time to waveform for a roughly 4-minute file is under 3 s (note the measured time).
6. Read the console (`read_console_messages`). Expected: no errors or CSP violations.

If anything fails, fix it in the owning task's file, re-run Step 1, and repeat. Do not claim success without having seen steps 1-6.

- [ ] **Step 4: Stop the preview server**

Stop only the background `vite preview` process this task started.

- [ ] **Step 5: Pause for review**

Report to the user: what works, the measured load-to-waveform time, any browser-only caveat found, that nothing is pushed and no GitHub repo exists yet, and ask whether to continue to step 2 (loop with IN/OUT handles, snap to beats, seamless looping). Do not start step 2.
