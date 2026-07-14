/**
 * The controller's per-frame tick is gone (proved: FireAnimationFrame 672 -> 0),
 * yet the main thread still runs a FULL lifecycle every frame. So something
 * else requests a main frame every frame. Ask the trace who:
 *
 *   - frame_reporter.has_main_animation  -> a MAIN-THREAD animation drove it
 *   - the live animations during a ride  -> which element, which properties
 *
 * Runs against the passive build (/on/), so the tick cannot muddy the answer.
 *
 *   node .perf-probe/deviceMainFrameSource.mjs
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

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().startsWith("http"));
if (!page) throw new Error("no page found on device");
await page.bringToFront();
await page.goto("http://127.0.0.1:8080/on/", { waitUntil: "load" });
await page.waitForTimeout(2000);

// ---- 1. Who is animating mid-ride, and on which thread? --------------------
const animations = await page.evaluate(
  () =>
    new Promise((resolve) => {
      document.querySelector('button[aria-label="Next slide"]')?.click();
      setTimeout(() => {
        resolve(
          document.getAnimations().map((a) => {
            const effect = a.effect;
            const target = effect?.target;
            const frames = effect?.getKeyframes?.() ?? [];
            const props = [
              ...new Set(
                frames.flatMap((f) =>
                  Object.keys(f).filter(
                    (k) => !["offset", "computedOffset", "easing", "composite"].includes(k),
                  ),
                ),
              ),
            ];
            return {
              target: target ? `${target.tagName}.${target.className}` : "(none)",
              props,
              keyframes: frames.length,
              playState: a.playState,
            };
          }),
        );
      }, 700);
    }),
);
console.log("live animations 700ms into a ride:");
for (const a of animations) {
  console.log(
    `  ${a.playState.padEnd(8)} [${a.props.join(", ").padEnd(22)}] x${String(a.keyframes).padStart(2)}kf  ${a.target}`,
  );
}

// ---- 2. What drives the main frames? ---------------------------------------
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

let frames = 0;
let mainAnim = 0;
let compAnim = 0;
let neither = 0;
const invalidators = new Map();

for (const e of events) {
  if (e.name === "PipelineReporter" && e.ph === "b") {
    const r = e.args?.frame_reporter ?? e.args?.chrome_frame_reporter;
    if (!r?.state || !inRide(toPageMs(e.ts))) continue;
    frames += 1;
    if (r.has_main_animation) mainAnim += 1;
    if (r.has_compositor_animation) compAnim += 1;
    if (!r.has_main_animation && !r.has_compositor_animation) neither += 1;
    continue;
  }
  // Who dirties style/layout every frame?
  if (
    e.ph === "X" &&
    inRide(toPageMs(e.ts)) &&
    /ScheduleStyleRecalculation|InvalidateLayout|StyleInvalidatorInvalidate|ScheduleRecalc/.test(
      e.name,
    )
  ) {
    invalidators.set(e.name, (invalidators.get(e.name) ?? 0) + 1);
  }
}

console.log(`\nframes during rides: ${frames}`);
console.log(`  has_main_animation:       ${mainAnim}`);
console.log(`  has_compositor_animation: ${compAnim}`);
console.log(`  neither:                  ${neither}`);
console.log("\nstyle/layout invalidations during rides:");
if (invalidators.size === 0) console.log("  (none recorded)");
for (const [name, n] of [...invalidators].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${name.padEnd(40)} x${n}`);
}

await browser.close();
