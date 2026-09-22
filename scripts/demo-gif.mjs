// Records docs/demo.gif: a short walk through the app in headless Chrome, encoded with lib/gif.mjs
// (no dependencies). Same setup as screenshots.mjs:
//   cd web && npm run build && npx vite preview --port 4199      (leave running)
//   node scripts/demo-gif.mjs
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { demo, fresh, launch, sleep } from "./lib/chrome.mjs";
import { decodePng, encodeGif, scaleTo } from "./lib/gif.mjs";

const OUT = process.env.OUT ?? join(import.meta.dirname, "../docs/demo.gif");
const WIDTH = 1280; // captured
const GIF_WIDTH = 880; // written
const HOLD = 170; // hundredths of a second per frame

const chrome = launch();
const frames = [];
let errors = [];
async function frame(p) {
  // Only the top of the page: the song, the loop and the band, above the fold.
  await p.waitFor(`!${p.text("Preparing")}`);
  await sleep(500);
  await p.eval(`window.scrollTo(0,0)`);
  const { data } = await p.send("Page.captureScreenshot", { format: "png" });
  frames.push(scaleTo(decodePng(Buffer.from(data, "base64")), GIF_WIDTH));
}

try {
  const p = await fresh(WIDTH, 800);
  await frame(p); // 1: the empty app
  await demo(p);
  await frame(p); // 2: the demo song, five parts
  await p.click("Loop Solo"); await p.click("Looping off");
  await frame(p); // 3: a loop on the solo
  await p.click("Mute"); await p.click("75%");
  await frame(p); // 4: guitar muted, slowed down
  await p.click("● Record"); await sleep(2500); await p.click("■ Stop take");
  await p.waitFor(`/Take \\d+ recorded|passes recorded/.test(document.body.innerText)`);
  await frame(p); // 5: a take in the band
  await p.eval(`document.querySelector(".progressive").open = true`);
  await p.check("On", true);
  await p.waitFor(p.text("Progressive tempo on"));
  await frame(p); // 6: progressive tempo and chords
  errors = p.errors;
} finally {
  await chrome.close();
}
if (errors.length) { console.log("console errors:", errors); process.exit(1); }
const gif = encodeGif(frames, frames.map((_, i) => (i === frames.length - 1 ? HOLD * 2 : HOLD)));
writeFileSync(OUT, gif);
console.log(`${OUT}: ${frames.length} frames, ${frames[0].width}x${frames[0].height}, ${(gif.length / 1024).toFixed(0)} KB`);
