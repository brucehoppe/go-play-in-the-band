// Walks the practice tools in headless Chrome against a built copy of the app and fails on any
// console error. Same setup as screenshots.mjs:
//   cd web && npm run build && npx vite preview --port 4199      (leave running)
//   node scripts/smoke.mjs
import { demo, fresh, launch, sleep } from "./lib/chrome.mjs";

const chrome = launch();
const failures = [];
async function step(name, fn) {
  try { await fn(); console.log("ok   " + name); }
  catch (err) { failures.push(name); console.log("FAIL " + name + ": " + err.message); }
}

try {
  const p = await fresh(1440, 900);
  await step("demo loads with five parts and chords", async () => {
    await demo(p);
    await p.waitFor(`document.querySelector(".chord-strip")`, 20000, "chord strip");
  });
  await step("loop, count-in, then play starts after the count-in", async () => {
    await p.click("Loop Intro"); await p.click("Looping off");
    await p.check("Count-in");
    await p.click("Play");
    await p.waitFor(p.text("count-in"), 5000, "count-in tag");
    await p.waitFor(`!${p.text("count-in")}`, 10000, "count-in over");
    await p.click("Pause");
  });
  await step("progressive tempo steps the speed up on wraps", async () => {
    await p.eval(`document.querySelector(".progressive").open = true`);
    await p.type("Start %", "60"); await p.type("Step %", "20"); await p.type("Every N passes", "1"); await p.type("Up to %", "100");
    await p.check("On", true);
    await p.waitFor(p.text("Progressive tempo on"));
    await p.waitFor(`!${p.text("Preparing")}`);
    await p.click("Play");
    // The intro is 4 bars of 100 BPM = 9.6 s; at 60% one pass is 16 s. Wait for one wrap.
    await p.waitFor(`document.querySelector(".speeds .on")?.textContent === "100%" || document.querySelector(".tempo-slider .mono")?.textContent.startsWith("80%")`, 40000, "speed stepped up");
    await p.click("Pause");
    await p.check("On", false);
    await p.click("100%");
  });
  await step("record at 75% over the loop: passes become takes, brought back to full speed", async () => {
    await p.click("75%"); await p.waitFor(`!${p.text("Preparing")}`);
    await p.check("Count-in", false);
    await p.click("● Record"); await sleep(28000); await p.click("■ Stop take");
    await p.waitFor(`/passes recorded as Takes|Take \\d+ recorded/.test(document.body.innerText)`, 30000, "take recorded");
    await p.waitFor(p.text("brought back to full speed"));
  });
  await step("only this take, delete a take", async () => {
    await p.click("100%"); await p.waitFor(`!${p.text("Preparing")}`);
    const takes = await p.eval(`[...document.querySelectorAll(".stem.take")].length`);
    if (takes < 1) throw new Error("no take rows");
    if (takes > 1) { await p.click("Only this take"); await p.waitFor(p.text("the other takes are muted")); }
    await p.click("Delete Take 1"); await p.waitFor(p.text("Take 1 deleted"));
  });
  await step("save a loop, and it comes back after a reload", async () => {
    await p.click("Save loop"); await p.type("Loop name", "Intro riff"); await p.click("Save");
    await p.waitFor(p.text('Loop "Intro riff" saved'));
    await p.send("Page.reload"); await p.waitFor(p.text("Try a demo song")); await sleep(500);
    await p.waitFor(p.text("Recent"), 10000, "recent list");
    await p.click("Demo: A minor jam"); await p.waitFor(p.text("parts"));
    await p.click("Loop Intro riff"); await p.waitFor(p.text("Loop set"));
  });
  await step("transpose, tap tempo, time signature, bar 1 here", async () => {
    await p.select("Transpose, semitones", "-2"); await p.waitFor(`!${p.text("Preparing")}`);
    await p.waitFor(p.text("Transposed down 2 semitones"));
    await p.select("Transpose, semitones", "0"); await p.waitFor(`!${p.text("Preparing")}`);
    for (let i = 0; i < 4; i++) { await p.click("Tap tempo"); await sleep(500); }
    await p.waitFor(`/BPM\\s*[6-9]\\d(\\.\\d)?\\b/.test(document.querySelector(".filecard").innerText)`, 5000, "tapped tempo");
    await p.select("Time signature", "3/4"); await p.waitFor(`document.querySelector(".filecard").innerText.includes("3/4")`);
    await p.click("Bar 1 here"); await p.click("10 ms ▸");
  });
  await step("tuner and monitor turn on and off without errors", async () => {
    await p.click("Tuner off"); await sleep(1500); await p.click("Tuner on");
    await p.click("Monitor off"); await p.waitFor(p.text("Monitor on:")); await p.click("Monitor on");
    await p.click("E2");
  });
  await step("export parts and save project produce downloads", async () => {
    await p.send("Browser.setDownloadBehavior", { behavior: "deny" }).catch(() => {});
    await p.click("Export parts"); await p.click("Save project"); await p.waitFor(p.text("Project saved"));
  });
  await step("second demo: E waltz in 3/4", async () => {
    await demo(p, "Demo: E waltz");
    await p.waitFor(`document.querySelector(".filecard").innerText.includes("3/4")`);
  });
  await step("record from nothing, reload, reopen the recording from Recent", async () => {
    const q = await fresh(1440, 900);
    await q.click("● Record"); await sleep(2000); await q.click("■ Stop take");
    await q.waitFor(q.text("Take 1 recorded"));
    await q.click("● Record"); await sleep(2000); await q.click("■ Stop take");
    await q.waitFor(q.text("2 parts"));
    await q.send("Page.reload"); await q.waitFor(q.text("Try a demo song")); await sleep(500);
    await q.click("My recording"); await q.waitFor(q.text("2 parts"));
    if (q.errors.length) throw new Error(q.errors.join(" | "));
  });
  if (p.errors.length) { failures.push("console"); console.log("console errors:", p.errors); }
} finally {
  await chrome.close();
}
console.log(failures.length ? `FAILED: ${failures.join(", ")}` : "all steps passed");
process.exit(failures.length ? 1 : 0);
