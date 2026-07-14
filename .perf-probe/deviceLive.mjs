/**
 * Measure the REAL deployment on GitHub Pages — not the local rig.
 *
 *   node .perf-probe/deviceLive.mjs [label]
 *
 * Drives rides with programmatic clicks and reports what the main thread does
 * while the compositor rides: BeginMainFrame / Paint / Layerize / recalcStyle,
 * plus how many ride frames were driven by a MAIN-THREAD animation.
 *
 * Reference points on this device (Redmi Note 11S, 4 rides):
 *   bare composited animation, main thread asleep ....... BeginMainFrame x8
 *   after the transition fix (local rig) ................ x13   ( 80ms)
 *   before the fix ..................................... x452  (2696ms)
 */
import { chromium } from "playwright-core";

const LABEL = process.argv[2] ?? "live";
const URL = "https://igor-lx.github.io/CarouselCC/";
const CLICKS = 4;
const GAP_MS = 2300;
const RIDE_MS = 1900;

const CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "blink.user_timing",
  "blink",
  "cc",
];

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().startsWith("http"));
if (!page) throw new Error("no page found on device");
await page.bringToFront();

// Cache-bust: GH Pages will happily serve the previous deploy.
await page.goto(`${URL}?probe=${Date.now()}`, { waitUntil: "load" });
await page.waitForTimeout(3000);

const sanity = await page.evaluate(() => ({
  dots: document.querySelectorAll('[class*="_dot"]').length,
  widget: document.querySelectorAll('[class*="_PW"]').length > 0,
  errorSlides: document.querySelectorAll('[class*="slideError"]').length,
  button: Boolean(document.querySelector('button[aria-label="Next slide"]')),
}));
console.log(
  `page: dots ${sanity.dots}, widget ${sanity.widget ? "MOUNTED" : "no"}, ` +
    `errorSlides ${sanity.errorSlides}, next-button ${sanity.button ? "ok" : "MISSING"}`,
);
if (!sanity.button) throw new Error("no Next button — cannot drive rides");
if (sanity.errorSlides > 0) throw new Error("slides in error state — bad measurement");

const session = await browser.newBrowserCDPSession();
await session.send("Tracing.start", {
  transferMode: "ReturnAsStream",
  traceConfig: { recordMode: "recordUntilFull", includedCategories: CATEGORIES },
});

const rides = [];
for (let i = 0; i < CLICKS; i += 1) {
  const t = await page.evaluate((first) => {
    if (first) {
      performance.clearMarks("probe-press");
      performance.mark("probe-press");
    }
    document.querySelector('button[aria-label="Next slide"]')?.click();
    return performance.now();
  }, i === 0);
  rides.push(t);
  await page.waitForTimeout(GAP_MS);
}
const press = await page.evaluate(
  () => performance.getEntriesByName("probe-press")[0].startTime,
);

const streamPromise = new Promise((r) =>
  session.on("Tracing.tracingComplete", (e) => r(e.stream)),
);
await session.send("Tracing.end");
const stream = await streamPromise;
let raw = "";
for (;;) {
  const c = await session.send("IO.read", { handle: stream });
  raw += c.base64Encoded ? Buffer.from(c.data, "base64").toString("utf8") : c.data;
  if (c.eof) break;
}
await session.send("IO.close", { handle: stream });

const events = JSON.parse(raw).traceEvents ?? [];
const mark = events.find(
  (e) => e.name === "probe-press" && e.cat?.includes("blink.user_timing"),
);
if (!mark) throw new Error("no probe-press mark in trace");
const toPageMs = (us) => press + (us - mark.ts) / 1000;
const inRide = (ms) => rides.some((s) => ms >= s && ms <= s + RIDE_MS);

const work = { BeginMainFrame: [0, 0], Paint: [0, 0], Layerize: [0, 0], recalcStyle: [0, 0] };
let frames = 0;
let mainAnim = 0;
let compAnim = 0;
let dropped = 0;

for (const e of events) {
  if (e.name === "PipelineReporter" && e.ph === "b") {
    const r = e.args?.frame_reporter ?? e.args?.chrome_frame_reporter;
    if (!r?.state || !inRide(toPageMs(e.ts))) continue;
    frames += 1;
    if (r.has_main_animation) mainAnim += 1;
    if (r.has_compositor_animation) compAnim += 1;
    if (/DROPPED/.test(r.state)) dropped += 1;
    continue;
  }
  if (e.ph !== "X" || !e.dur || !inRide(toPageMs(e.ts))) continue;
  const slot =
    e.name === "ProxyMain::BeginMainFrame"
      ? work.BeginMainFrame
      : e.name === "Blink.Paint.UpdateTime"
        ? work.Paint
        : e.name === "Layerize"
          ? work.Layerize
          : e.name === "Document::recalcStyle"
            ? work.recalcStyle
            : null;
  if (slot) {
    slot[0] += 1;
    slot[1] += e.dur / 1000;
  }
}

console.log(`\n=== ${LABEL} — LIVE on GitHub Pages (${CLICKS} rides) ===`);
for (const [name, [n, ms]] of Object.entries(work)) {
  console.log(`  ${name.padEnd(16)} x${String(n).padStart(3)}   ${ms.toFixed(0).padStart(4)}ms`);
}
console.log(
  `  frames ${frames}   main_anim ${mainAnim}   compositor_anim ${compAnim}   DROPPED ${dropped}`,
);
const verdict = work.BeginMainFrame[0] < 60 ? "MAIN THREAD IDLE ✅" : "MAIN THREAD BUSY ❌";
console.log(`  => ${verdict}`);

await browser.close();
