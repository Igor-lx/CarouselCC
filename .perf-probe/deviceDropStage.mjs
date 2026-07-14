/**
 * Before deferring ANY work off the first frame of a step: find out where the
 * dropped frames actually die. Chrome's frame reporter carries a stage
 * breakdown — if the frames are lost in raster/activation/GPU, then no amount
 * of moving JS to a later frame can save them, and the "unload the start"
 * idea is dead on arrival.
 *
 *   node .perf-probe/deviceDropStage.mjs
 */
import { chromium } from "playwright-core";

const CLICKS = 6;
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
await page.goto("http://127.0.0.1:8080/on/", { waitUntil: "load" });
await page.waitForTimeout(2200);

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

let dropped = 0;
let presented = 0;
const stages = new Map();
const reasons = new Map();
const samples = [];

for (const e of events) {
  if (e.name !== "PipelineReporter" || e.ph !== "b") continue;
  const r = e.args?.frame_reporter ?? e.args?.chrome_frame_reporter;
  const ms = toPageMs(e.ts);
  const ride = rideOf(ms);
  if (!r?.state || ride < 0) continue;

  if (/PRESENTED/.test(r.state)) {
    presented += 1;
    continue;
  }
  if (!/DROPPED/.test(r.state)) continue;
  dropped += 1;

  // Where did it die? The reporter names the stage it was in.
  const stage =
    r.termination_status ??
    r.breakdown_stage ??
    r.current_stage ??
    r.scroll_state ??
    "(no stage field)";
  stages.set(stage, (stages.get(stage) ?? 0) + 1);

  const flags = Object.entries(r)
    .filter(([k, v]) => v === true && k !== "is_accompanied_by_main_thread_update")
    .map(([k]) => k)
    .join(" ");
  reasons.set(flags || "(none)", (reasons.get(flags) ?? 0) + 1);

  if (samples.length < 3) samples.push(r);
}

console.log(`\ndropped ${dropped} of ${presented + dropped} during ${CLICKS} rides\n`);
console.log("stage where the frame died:");
for (const [s, n] of [...stages].sort((a, b) => b[1] - a[1])) {
  console.log(`  x${String(n).padStart(2)}  ${s}`);
}
console.log("\nboolean flags Chrome set on the dropped frames:");
for (const [f, n] of [...reasons].sort((a, b) => b[1] - a[1])) {
  console.log(`  x${String(n).padStart(2)}  ${f}`);
}
console.log("\nraw reporter of one dropped frame (all fields):");
console.log(JSON.stringify(samples[0] ?? {}, null, 2).slice(0, 900));

await browser.close();
