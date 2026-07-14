/**
 * The controller's tick is gone, yet the main thread still runs a full
 * lifecycle every frame, and the trace says a MAIN-THREAD animation drives
 * 1099/1112 ride frames. The only non-track animations alive during a ride are
 * the pagination dots (opacity + transform, 33kf, will-change set — and still
 * not composited).
 *
 * Decisive test, on the passive build:
 *   A) as shipped
 *   B) pagination removed from the DOM (controls stay, so rides still fire)
 *
 * If B collapses BeginMainFrame / Paint / Layerize, the dots ARE the per-frame
 * main-thread source. If it does NOT, something deeper drives the frames and
 * the dots are a red herring — which is the outcome the slotless run predicts.
 *
 *   node .perf-probe/deviceDotsCause.mjs
 */
import { chromium } from "playwright-core";

const CLICKS = 5;
const GAP_MS = 2400;
const RIDE_MS = 1900;

const CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "blink.user_timing",
  "blink",
  "cc",
  "gpu",
  "viz",
  "benchmark",
  "toplevel",
];

const WORK = [
  "ProxyMain::BeginMainFrame",
  "LocalFrameView::RunPaintLifecyclePhase",
  "Blink.Paint.UpdateTime",
  "Layerize",
  "Document::recalcStyle",
];

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().startsWith("http"));
if (!page) throw new Error("no page found on device");
await page.bringToFront();

const runPhase = async (label, prepare) => {
  await page.goto("http://127.0.0.1:8080/on/", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  await prepare();
  await page.waitForTimeout(400);

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
  if (!mark) throw new Error(`${label}: no probe-press mark`);
  const toPageMs = (us) => press + (us - mark.ts) / 1000;
  const inRide = (ms) => rides.some((s) => ms >= s && ms <= s + RIDE_MS);

  const work = Object.fromEntries(WORK.map((n) => [n, { n: 0, ms: 0 }]));
  let frames = 0;
  let mainAnim = 0;
  let dropped = 0;

  for (const e of events) {
    if (e.name === "PipelineReporter" && e.ph === "b") {
      const r = e.args?.frame_reporter ?? e.args?.chrome_frame_reporter;
      if (!r?.state || !inRide(toPageMs(e.ts))) continue;
      frames += 1;
      if (r.has_main_animation) mainAnim += 1;
      if (/DROPPED/.test(r.state)) dropped += 1;
      continue;
    }
    if (e.ph !== "X" || !e.dur || !inRide(toPageMs(e.ts))) continue;
    const slot = work[e.name];
    if (slot) {
      slot.n += 1;
      slot.ms += e.dur / 1000;
    }
  }

  console.log(`\n--- ${label} ---`);
  console.log(
    `  frames ${frames}   has_main_animation ${mainAnim}   DROPPED ${dropped}`,
  );
  for (const name of WORK) {
    const { n, ms } = work[name];
    console.log(
      `  ${name.padEnd(40)} x${String(n).padStart(4)}  ${ms.toFixed(0).padStart(5)}ms`,
    );
  }
  return { work, frames, mainAnim };
};

console.log("Are the pagination dots the per-frame main-thread source?");
const a = await runPhase("A) as shipped", async () => {});
const b = await runPhase("B) pagination REMOVED", async () => {
  await page.evaluate(() => {
    document
      .querySelectorAll('[class*="_dot_"], [class*="pagination"], [class*="Pagination"]')
      .forEach((n) => n.remove());
  });
});

console.log("\n=== verdict ===");
for (const name of WORK) {
  const x = a.work[name];
  const y = b.work[name];
  console.log(
    `  ${name.padEnd(40)} x${String(x.n).padStart(4)} ${x.ms.toFixed(0).padStart(5)}ms  ->  x${String(y.n).padStart(4)} ${y.ms.toFixed(0).padStart(5)}ms`,
  );
}
console.log(
  `\n  main-thread-animation frames: ${a.mainAnim}/${a.frames}  ->  ${b.mainAnim}/${b.frames}`,
);

await browser.close();
