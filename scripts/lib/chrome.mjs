// Drives a built copy of the app in headless Chrome over the DevTools protocol.
// No dependencies: Node 22+ (built-in WebSocket) and Google Chrome.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export { sleep };

export const APP_URL = process.env.APP_URL ?? "http://localhost:4199/";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = Number(process.env.CDP_PORT ?? 9333);

/** Start Chrome with a fake microphone and a throwaway profile. Returns a `close()` that waits for it to exit. */
export function launch() {
  const profile = mkdtempSync(join(tmpdir(), "gpitb-chrome-"));
  const chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required", "--hide-scrollbars", "--no-first-run", "about:blank",
  ], { stdio: "ignore" });
  return {
    async close() {
      // Chrome's throwaway profile is up to 140 MB; wait for Chrome to let go of it, then remove it.
      const gone = once(chrome, "exit");
      chrome.kill();
      await gone;
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
      return t.webSocketDebuggerUrl;
    } catch { await sleep(200); }
  }
  throw new Error("Chrome did not start");
}

export class Page {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.errors = [];
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id) { const p = this.pending.get(d.id); this.pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
      else if (d.method === "Runtime.exceptionThrown") this.errors.push(d.params.exceptionDetails.text + " " + (d.params.exceptionDetails.exception?.description ?? ""));
      else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") this.errors.push(d.params.args.map((a) => a.value ?? a.description).join(" "));
    };
  }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.pending.set(id, { res, rej })); }
  async eval(expr) { const r = await this.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; }
  async waitFor(expr, ms = 120000, what = expr) { const t = Date.now(); while (Date.now() - t < ms) { if (await this.eval(`!!(${expr})`)) return; await sleep(150); } throw new Error("Timed out waiting for: " + what); }
  /** Click the first enabled button whose text or aria-label matches exactly. */
  async click(label) {
    const match = `[...document.querySelectorAll("button")].find(b => !b.disabled && (b.textContent.trim() === ${JSON.stringify(label)} || b.getAttribute("aria-label") === ${JSON.stringify(label)}))`;
    await this.waitFor(match, 60000, "button " + label);
    await this.eval(`${match}.click()`);
    await sleep(250);
  }
  /** Choose an option (by its value) in the select with this aria-label, as a user would. */
  async select(label, value) {
    const sel = `[...document.querySelectorAll("select")].find(s => s.getAttribute("aria-label") === ${JSON.stringify(label)})`;
    await this.waitFor(sel, 60000, "select " + label);
    await this.eval(`(() => { const s = ${sel}; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; setter.call(s, ${JSON.stringify(String(value))}); s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    await sleep(250);
  }
  /** Type into the input with this aria-label or placeholder, as a user would (React sees it). */
  async type(label, text) {
    const sel = `[...document.querySelectorAll("input")].find(i => i.getAttribute("aria-label") === ${JSON.stringify(label)} || i.placeholder === ${JSON.stringify(label)})`;
    await this.waitFor(sel, 60000, "input " + label);
    await this.eval(`(() => { const i = ${sel}; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; setter.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    await sleep(100);
  }
  /** Tick or untick the checkbox whose label text contains `text`. */
  async check(text, on = true) {
    const sel = `[...document.querySelectorAll("label")].find(l => l.textContent.includes(${JSON.stringify(text)}))?.querySelector("input[type=checkbox]")`;
    await this.waitFor(`${sel} && !${sel}.disabled`, 60000, "checkbox " + text);
    await this.eval(`(() => { const c = ${sel}; if (c.checked !== ${on}) c.click(); })()`);
    await sleep(250);
  }
  text(s) { return `document.body.innerText.includes(${JSON.stringify(s)})`; }
  async upload(path) {
    const { root } = await this.send("DOM.getDocument");
    const { nodeId } = await this.send("DOM.querySelector", { nodeId: root.nodeId, selector: "input[type=file]" });
    await this.send("DOM.setFileInputFiles", { nodeId, files: [path] });
  }
  async size(width, height) { await this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }); }
  /** PNG bytes of the page grown to its full height (nothing hides behind the pinned transport bar). */
  async capture(width) {
    await this.waitFor(`!${this.text("Preparing")}`);
    await sleep(600);
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
    return { png: Buffer.from(data, "base64"), height: h };
  }
}

/** A new tab on the app with storage cleared. */
export async function fresh(width, height, { blockServer = false, keepStorage = false } = {}) {
  const p = new Page(await new Promise(async (res) => { const ws = new WebSocket(await connect()); ws.onopen = () => res(ws); }));
  await p.send("Runtime.enable"); await p.send("Page.enable"); await p.send("DOM.enable"); await p.send("Network.enable");
  if (!keepStorage) await p.send("Storage.clearDataForOrigin", { origin: new URL(APP_URL).origin, storageTypes: "all" });
  if (blockServer) await p.send("Network.setBlockedURLs", { urls: ["*127.0.0.1:8765*"] });
  await p.size(width, height);
  await p.send("Page.navigate", { url: APP_URL });
  await p.waitFor(p.text("Try a demo song"));
  await sleep(500);
  return p;
}

/** Load the first demo song (A minor jam) and wait for its five parts. */
export async function demo(p, name = "Demo: A minor jam", parts = "5 parts") {
  await p.select("Try a demo song", name);
  await p.waitFor(p.text(parts));
}
