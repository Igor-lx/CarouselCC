/**
 * Chrome-trace probe: records a devtools.timeline trace across one click
 * glide, then reports every task longer than 30ms in any process/thread
 * between click and settle, plus painted-frame (DrawFrame) gaps — with exact
 * clock correlation via an in-page performance.mark that lands in the trace
 * (blink.user_timing).
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const URL = "http://localhost:4173/CarouselCC/";
const TRACE = ".perf-probe/out/trace.json";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForSelector("[data-carousel-track]");
await page.waitForTimeout(2500);

await browser.startTracing(page, {
  path: TRACE,
  categories: [
    "devtools.timeline",
    "disabled-by-default-devtools.timeline",
    "disabled-by-default-devtools.timeline.frame",
    "blink.user_timing",
    "cc",
    "gpu",
  ],
});
await page.evaluate(() => {
  performance.mark("probe-click");
  document.querySelector('button[aria-label="Next slide"]').click();
});
await page.waitForTimeout(4600);
await browser.stopTracing();
await browser.close();

// ---- analysis ----
const trace = JSON.parse(readFileSync(TRACE, "utf8"));
const events = trace.traceEvents ?? trace;

const clickMark = events.find(
  (e) => e.name === "probe-click" && e.cat?.includes("blink.user_timing"),
);
if (!clickMark) throw new Error("probe-click mark not found in trace");
const t0 = clickMark.ts;
const rel = (ts) => ((ts - t0) / 1000).toFixed(0);

// Long tasks in any thread within the glide window.
const windowEnd = t0 + 4500 * 1000;
const long = events
  .filter(
    (e) =>
      e.ph === "X" &&
      e.dur > 30_000 &&
      e.ts > t0 - 100_000 &&
      e.ts < windowEnd,
  )
  .sort((a, b) => a.ts - b.ts)
  .map(
    (e) =>
      `+${rel(e.ts)}ms dur=${(e.dur / 1000).toFixed(0)}ms  ${e.name}  pid=${e.pid} tid=${e.tid}` +
      (e.args?.data?.url ? `  url=${String(e.args.data.url).slice(-40)}` : ""),
  );
console.log("=== tasks >30ms during glide ===");
console.log(long.join("\n") || "(none)");

// Painted frames: DrawFrame / DroppedFrame events on the compositor.
const frames = events
  .filter((e) => e.name === "DrawFrame" && e.ts > t0 - 300_000 && e.ts < windowEnd)
  .map((e) => e.ts)
  .sort((a, b) => a - b);
console.log(`\n=== DrawFrame events: ${frames.length} ===`);
const gaps = [];
for (let i = 1; i < frames.length; i += 1) {
  const gap = (frames[i] - frames[i - 1]) / 1000;
  if (gap > 45) gaps.push(`+${rel(frames[i - 1])}ms gap=${gap.toFixed(0)}ms`);
}
console.log("DrawFrame gaps>45ms:", gaps.join(" | ") || "(none)");

// Image decodes specifically.
const decodes = events
  .filter(
    (e) =>
      /Decode|decode/.test(e.name) &&
      e.ph === "X" &&
      e.ts > t0 - 100_000 &&
      e.ts < windowEnd &&
      e.dur > 5_000,
  )
  .sort((a, b) => a.ts - b.ts)
  .map((e) => `+${rel(e.ts)}ms dur=${(e.dur / 1000).toFixed(1)}ms ${e.name}`);
console.log("\n=== decode tasks >5ms ===");
console.log(decodes.join("\n") || "(none)");
