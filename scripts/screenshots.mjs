// Recapture docs/screenshots/01-11 from a built copy of the app, over the Chrome DevTools protocol.
// No dependencies: Node 22+ (built-in WebSocket) and Google Chrome (driver in lib/chrome.mjs).
//
//   cd web && npm run build && npx vite preview --port 4199      (leave running)
//   REC_DIR=~/Music/GarageBand/recordings node scripts/screenshots.mjs [scene ...]
//
// Shots 05-07 load your own recordings (names in SONGS below) from REC_DIR; without it they are skipped.
// The local backend is blocked inside this browser for those, so a recording stays one full mix.
// Shot 09 is the opposite: it needs the backend (scripts/run-server.sh), CLIP=<a short recording>, and the
// build served on a port the backend allows:  npx vite preview --port 8766, then APP_URL=http://localhost:8766/
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { APP_URL, demo, fresh, launch, sleep } from "./lib/chrome.mjs";

const OUT = process.env.OUT_DIR ?? join(import.meta.dirname, "../docs/screenshots");
const REC = process.env.REC_DIR ? process.env.REC_DIR.replace(/\/?$/, "/") : null;
const SONGS = { full: "no new tale- 2026-05-10, 13.45.mp3", split: "mad world- 2026-05-10, 18.21.mp3" };
const CLIP = process.env.CLIP ?? null;
const only = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
void APP_URL;

const chrome = launch();

/** Save a full-page screenshot to docs/screenshots. */
async function shot(p, name, width) {
  const { png, height } = await p.capture(width);
  writeFileSync(`${OUT}/${name}.png`, png);
  console.log(`${name}.png  ${width}x${height}  header: ${await p.eval(`document.querySelector(".filecard")?.innerText.replace(/\\n/g," ") ?? "(none)"`)}`);
}
async function record(p, parts) { await p.click("● Record"); await sleep(3000); await p.click("■ Stop take"); await p.waitFor(p.text(parts)); }
async function ownSong(p, file, thenParts) {
  await p.upload(REC + file);
  await p.waitFor(p.text("(full mix)"));
  // Tempo and key are estimated in the background; wait for them to land in the header.
  await p.waitFor(`/BPM\\s*\\d/.test(document.querySelector(".filecard").innerText)`, 180000, "tempo estimate");
  if (thenParts) { await p.click("Quick split"); await p.waitFor(p.text(thenParts), 180000); }
}

const scenes = {
  "01-start": async () => { const p = await fresh(1440, 900); await shot(p, "01-start", 1440); return p; },
  "02-demo-loaded": async () => { const p = await fresh(1440, 900); await demo(p); await shot(p, "02-demo-loaded", 1440); return p; },
  "03-loop-mute-75": async () => {
    const p = await fresh(1440, 900); await demo(p);
    await p.click("Loop Intro"); await p.click("Mute"); await p.click("75%");
    await shot(p, "03-loop-mute-75", 1440); return p;
  },
  "04-overdub-take": async () => { const p = await fresh(1440, 900); await demo(p); await record(p, "6 parts"); await shot(p, "04-overdub-take", 1440); return p; },
  "05-own-recording": async () => {
    const p = await fresh(1440, 900, { blockServer: true });
    await ownSong(p, SONGS.full);
    await shot(p, "05-own-recording", 1440); return p;
  },
  "06-song-tools": async () => {
    const p = await fresh(1440, 900, { blockServer: true });
    await ownSong(p, SONGS.split, "3 parts");
    await p.click("Add click track"); await p.waitFor(p.text("4 parts"));
    await p.click("Set in"); await p.click("Play"); await sleep(4000); await p.click("Set out"); await p.click("Pause");
    await p.click("Snap to bars");
    await shot(p, "06-song-tools", 1440); return p;
  },
  "07-devices-tempo": async () => {
    const p = await fresh(1440, 900, { blockServer: true });
    await ownSong(p, SONGS.split, "3 parts");
    await record(p, "4 parts");
    await p.click("Show device names").catch(() => {});
    await p.click("75%");
    await shot(p, "07-devices-tempo", 1440); return p;
  },
  "08-slow-and-solo": async () => {
    const p = await fresh(1440, 900); await demo(p);
    await p.click("Solo guitar"); await p.click("25%");
    await shot(p, "08-slow-and-solo", 1440); return p;
  },
  "10-practice-tools": async () => {
    const p = await fresh(1440, 900); await demo(p);
    await p.click("Loop Solo"); await p.click("Looping off");
    await p.click("Save loop"); await p.type("Loop name", "Solo, bars 13-16"); await p.click("Save");
    await p.check("Count-in");
    await p.eval(`document.querySelector(".progressive").open = true`);
    await p.check("On", true);
    await p.waitFor(p.text("Progressive tempo on"));
    await p.select("Transpose, semitones", "-2");
    await p.waitFor(`!${p.text("Preparing")}`);
    await shot(p, "10-practice-tools", 1440); return p;
  },
  "11-waltz-tuner": async () => {
    const p = await fresh(1440, 900); await demo(p, "Demo: E waltz");
    await p.click("Tuner off"); await sleep(1500);
    await p.click("Monitor off");
    await record(p, "6 parts"); await record(p, "7 parts");
    await shot(p, "11-waltz-tuner", 1440); return p;
  },
  "09-instrument-stems": async () => {
    const p = await fresh(1440, 900);
    await p.upload(CLIP);
    await p.waitFor(`document.querySelector("#stem-guitar") && /BPM\\s*\\d/.test(document.querySelector(".filecard").innerText)`, 600000, "instrument stems");
    await shot(p, "09-instrument-stems", 1440); return p;
  },
};

let failed = false;
try {
  for (const [name, run] of Object.entries(scenes)) {
    if (only.length && !only.includes(name)) continue;
    if (!REC && /^0[567]/.test(name)) { console.log(`skipped ${name}: set REC_DIR`); continue; }
    if (!CLIP && /^09/.test(name)) { console.log(`skipped ${name}: set CLIP, and see the note at the top`); continue; }
    try {
      const p = await run();
      if (p.errors.length) { failed = true; console.log(`  console errors in ${name}:`, p.errors); }
      p.ws.close();
    } catch (err) { failed = true; console.log(`FAILED ${name}: ${err.message}`); }
  }
} finally {
  await chrome.close();
}
process.exit(failed ? 1 : 0);
