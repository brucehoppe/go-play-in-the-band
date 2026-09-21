// Recapture docs/screenshots/01-07 from a built copy of the app, over the Chrome DevTools protocol.
// No dependencies: Node 22+ (built-in WebSocket) and Google Chrome.
//
//   cd web && npm run build && npx vite preview --port 4199      (leave running)
//   REC_DIR=~/Music/GarageBand/recordings node scripts/screenshots.mjs [scene ...]
//
// Shots 05-07 load your own recordings (names in SONGS below) from REC_DIR; without it they are skipped.
// The local backend is blocked inside this browser for those, so a recording stays one full mix.
// Shot 09 is the opposite: it needs the backend (scripts/run-server.sh), CLIP=<a short recording>, and the
// build served on a port the backend allows:  npx vite preview --port 8766, then APP_URL=http://localhost:8766/
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const URL_ = process.env.APP_URL ?? "http://localhost:4199/";
const OUT = process.env.OUT_DIR ?? join(import.meta.dirname, "../docs/screenshots");
const PROFILE = mkdtempSync(join(tmpdir(), "gpitb-shots-"));
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const REC = process.env.REC_DIR ? process.env.REC_DIR.replace(/\/?$/, "/") : null;
const SONGS = { full: "no new tale- 2026-05-10, 13.45.mp3", split: "mad world- 2026-05-10, 18.21.mp3" };
const CLIP = process.env.CLIP ?? null;
const only = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
  "--autoplay-policy=no-user-gesture-required", "--hide-scrollbars", "--no-first-run", "about:blank",
], { stdio: "ignore" });

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
      return t.webSocketDebuggerUrl;
    } catch { await sleep(200); }
  }
  throw new Error("Chrome did not start");
}

class Page {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.errors = [];
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id) { const p = this.pending.get(d.id); this.pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
      else if (d.method === "Runtime.exceptionThrown") this.errors.push(d.params.exceptionDetails.text);
      else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") this.errors.push(d.params.args.map((a) => a.value ?? a.description).join(" "));
    };
  }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.pending.set(id, { res, rej })); }
  async eval(expr) { const r = await this.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; }
  async waitFor(expr, ms = 120000, what = expr) { const t = Date.now(); while (Date.now() - t < ms) { if (await this.eval(`!!(${expr})`)) return; await sleep(150); } throw new Error("Timed out waiting for: " + what); }
  /** Click the first enabled button whose text or aria-label matches exactly. */
  async click(label) {
    await this.waitFor(`[...document.querySelectorAll("button")].some(b => !b.disabled && (b.textContent.trim() === ${JSON.stringify(label)} || b.getAttribute("aria-label") === ${JSON.stringify(label)}))`, 60000, "button " + label);
    await this.eval(`[...document.querySelectorAll("button")].find(b => !b.disabled && (b.textContent.trim() === ${JSON.stringify(label)} || b.getAttribute("aria-label") === ${JSON.stringify(label)})).click()`);
    await sleep(250);
  }
  text(s) { return `document.body.innerText.includes(${JSON.stringify(s)})`; }
  async upload(path) {
    const { root } = await this.send("DOM.getDocument");
    const { nodeId } = await this.send("DOM.querySelector", { nodeId: root.nodeId, selector: "input[type=file]" });
    await this.send("DOM.setFileInputFiles", { nodeId, files: [path] });
  }
  async size(width, height) { await this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }); }
  async shot(name, width) {
    await this.waitFor(`!${this.text("Preparing")}`);
    await sleep(600);
    // Grow the window to the whole page so nothing hides behind the pinned transport bar.
    // The waveforms grow with the window, so repeat until the height settles.
    let h = 0;
    for (let i = 0; i < 6; i++) {
      const next = Math.max(760, await this.eval(`document.documentElement.scrollHeight`));
      if (next === h) break;
      h = next;
      await this.size(width, h);
      await sleep(300);
    }
    await this.eval(`window.scrollTo(0,0)`);
    await sleep(500);
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"));
    console.log(`${name}.png  ${width}x${h}  header: ${await this.eval(`document.querySelector(".filecard")?.innerText.replace(/\\n/g," ") ?? "(none)"`)}`);
  }
}

async function fresh(width, height, { blockServer = false } = {}) {
  const p = new Page(await new Promise(async (res) => { const ws = new WebSocket(await connect()); ws.onopen = () => res(ws); }));
  await p.send("Runtime.enable"); await p.send("Page.enable"); await p.send("DOM.enable"); await p.send("Network.enable");
  await p.send("Storage.clearDataForOrigin", { origin: new URL(URL_).origin, storageTypes: "all" });
  if (blockServer) await p.send("Network.setBlockedURLs", { urls: ["*127.0.0.1:8765*"] });
  await p.size(width, height);
  await p.send("Page.navigate", { url: URL_ });
  await p.waitFor(p.text("Try the demo song"));
  await sleep(500);
  return p;
}
async function demo(p) { await p.click("Try the demo song"); await p.waitFor(p.text("5 parts")); }
async function record(p, parts) { await p.click("● Record"); await sleep(3000); await p.click("■ Stop take"); await p.waitFor(p.text(parts)); }
async function ownSong(p, file, thenParts) {
  await p.upload(REC + file);
  await p.waitFor(p.text("(full mix)"));
  // Tempo and key are estimated in the background; wait for them to land in the header.
  await p.waitFor(`/BPM\\s*\\d/.test(document.querySelector(".filecard").innerText)`, 180000, "tempo estimate");
  if (thenParts) { await p.click("Quick split"); await p.waitFor(p.text(thenParts), 180000); }
}

const scenes = {
  "01-start": async () => { const p = await fresh(1440, 900); await p.shot("01-start", 1440); return p; },
  "02-demo-loaded": async () => { const p = await fresh(1440, 900); await demo(p); await p.shot("02-demo-loaded", 1440); return p; },
  "03-loop-mute-75": async () => {
    const p = await fresh(1440, 900); await demo(p);
    await p.click("Loop Intro"); await p.click("Mute"); await p.click("75%");
    await p.shot("03-loop-mute-75", 1440); return p;
  },
  "04-overdub-take": async () => { const p = await fresh(1440, 900); await demo(p); await record(p, "6 parts"); await p.shot("04-overdub-take", 1440); return p; },
  "05-own-recording": async () => {
    const p = await fresh(1440, 900, { blockServer: true });
    await ownSong(p, SONGS.full);
    await p.shot("05-own-recording", 1440); return p;
  },
  "06-song-tools": async () => {
    const p = await fresh(1440, 900, { blockServer: true });
    await ownSong(p, SONGS.split, "3 parts");
    await p.click("Add click track"); await p.waitFor(p.text("4 parts"));
    await p.click("Set in"); await p.click("Play"); await sleep(4000); await p.click("Set out"); await p.click("Pause");
    await p.click("Snap to bars");
    await p.shot("06-song-tools", 1440); return p;
  },
  "07-devices-tempo": async () => {
    const p = await fresh(1440, 900, { blockServer: true });
    await ownSong(p, SONGS.split, "3 parts");
    await record(p, "4 parts");
    await p.click("Show device names").catch(() => {});
    await p.click("75%");
    await p.shot("07-devices-tempo", 1440); return p;
  },
  "08-slow-and-solo": async () => {
    const p = await fresh(1440, 900); await demo(p);
    await p.click("Solo guitar"); await p.click("25%");
    await p.shot("08-slow-and-solo", 1440); return p;
  },
  "09-instrument-stems": async () => {
    const p = await fresh(1440, 900);
    await p.upload(CLIP);
    await p.waitFor(`document.querySelector("#stem-guitar") && /BPM\\s*\\d/.test(document.querySelector(".filecard").innerText)`, 600000, "instrument stems");
    await p.shot("09-instrument-stems", 1440); return p;
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
  // Chrome's throwaway profile is up to 140 MB; wait for Chrome to let go of it, then remove it.
  const gone = once(chrome, "exit");
  chrome.kill();
  await gone;
  rmSync(PROFILE, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
