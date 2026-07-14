/**
 * The main thread is idle behind a ride now (BeginMainFrame x12 / 4 rides), yet
 * frames are still dropped: ~10-12 of 465 with the widget, 3 of 499 with the
 * plain pagination. With the old dominant cost gone, whatever is left is now
 * the top cost — so ask what it is instead of guessing.
 *
 * For every DROPPED frame, print Chrome's own reason flags. Then count the work
 * that competes with a ride: image decode, raster, GPU.
 *
 *   node .perf-probe/deviceDrops.mjs
 */
import { chromium } from "playwright-core";

const URL = "https://igor-lx.github.io/CarouselCC/";
const CLICKS = 5;
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
await page.goto(`${URL}?probe=${Date.now()}`, { waitUntil: "load" });
await page.waitForTimeout(3000);

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
if (!mark) throw new Error("no probe-press mark");
const toPageMs = (us) => press + (us - mark.ts) / 1000;
const rideOf = (ms) => rides.findIndex((s) => ms >= s && ms <= s + RIDE_MS);

const dropReasons = new Map();
const dropPhase = { start: 0, middle: 0, end: 0 };
let dropped = 0;
let presented = 0;
const competing = new Map();

for (const e of events) {
  if (e.name === "PipelineReporter" && e.ph === "b") {
    const r = e.args?.frame_reporter ?? e.args?.chrome_frame_reporter;
    const ms = toPageMs(e.ts);
    const ride = rideOf(ms);
    if (!r?.state || ride < 0) continue;
    if (/PRESENTED/.test(r.state)) presented += 1;
    if (!/DROPPED/.test(r.state)) continue;

    dropped += 1;
    const flags = [
      r.affects_smoothness ? "affects_smoothness" : null,
      r.has_main_animation ? "main_anim" : null,
      r.has_compositor_animation ? "comp_anim" : null,
      r.has_missing_content ? "MISSING_CONTENT" : null,
    ]
      .filter(Boolean)
      .join(" + ");
    dropReasons.set(flags || "(no flags)", (dropReasons.get(flags) ?? 0) + 1);

    const into = (ms - rides[ride]) / RIDE_MS;
    if (into < 0.2) dropPhase.start += 1;
    else if (into > 0.8) dropPhase.end += 1;
    else dropPhase.middle += 1;
    continue;
  }

  if (e.ph !== "X" || !e.dur || rideOf(toPageMs(e.ts)) < 0) continue;
  if (/Decode|Raster|GPUTask|ImageDecode/.test(e.name)) {
    const slot = competing.get(e.name) ?? [0, 0];
    slot[0] += 1;
    slot[1] += e.dur / 1000;
    competing.set(e.name, slot);
  }
}

console.log(`\n=== dropped frames during ${CLICKS} live rides ===`);
console.log(`  presented ${presented}   DROPPED ${dropped}  (${((dropped / (presented + dropped)) * 100).toFixed(1)}%)`);

console.log("\n  Chrome's own flags on the dropped frames:");
for (const [flags, n] of [...dropReasons].sort((a, b) => b[1] - a[1])) {
  console.log(`    x${String(n).padStart(3)}  ${flags}`);
}

console.log("\n  WHERE in the ride they fall:");
console.log(
  `    first 20% ${dropPhase.start}   middle ${dropPhase.middle}   last 20% ${dropPhase.end}`,
);

console.log("\n  work competing with the ride (decode / raster / gpu):");
const top = [...competing].sort((a, b) => b[1][1] - a[1][1]).slice(0, 8);
if (top.length === 0) console.log("    (none)");
for (const [name, [n, ms]] of top) {
  console.log(`    ${name.padEnd(34)} x${String(n).padStart(3)}  ${ms.toFixed(0).padStart(4)}ms`);
}

await browser.close();
