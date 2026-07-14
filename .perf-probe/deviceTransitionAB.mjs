/**
 * The suspect, found in the source (Pagination.module.scss):
 *
 *   .dot       { transition: opacity 0.4s, transform 0.5s; }
 *   .dotActive { opacity: ...; transform: scaleX(...); }
 *
 * The dot's WAAPI fade animates opacity+transform. During a ride React moves
 * the .dotActive class, so the CSS transition fires on THE SAME properties.
 * Two effects on one property: Blink cannot composite that, and drops the
 * animation to the main thread for the rest of the ride.
 *
 * That is why every hand-made replica composited — no class change, no
 * transition — and why "touching" the class with a meaningless name changed
 * nothing: it altered no transitioned property.
 *
 *   A) as shipped
 *   B) dot transitions disabled (nothing else touched)
 *
 * If B collapses the main-thread lifecycle, cause AND fix are confirmed on the
 * real app in one shot.
 *
 *   node .perf-probe/deviceTransitionAB.mjs
 */
import { chromium } from "playwright-core";

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

const runPhase = async (label, killTransition) => {
  await page.goto("http://127.0.0.1:8080/on/", { waitUntil: "load" });
  await page.waitForTimeout(1800);

  if (killTransition) {
    await page.evaluate(() => {
      const style = document.createElement("style");
      style.textContent = `[class*="_dot_"] { transition: none !important; }`;
      document.head.appendChild(style);
    });
  }

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

  let beginMainFrame = 0;
  let beginMainMs = 0;
  let paint = 0;
  let layerize = 0;
  let recalc = 0;
  let recalcMs = 0;
  let mainAnim = 0;
  let compAnim = 0;
  let frames = 0;
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
    if (e.name === "ProxyMain::BeginMainFrame") {
      beginMainFrame += 1;
      beginMainMs += e.dur / 1000;
    }
    if (e.name === "Blink.Paint.UpdateTime") paint += 1;
    if (e.name === "Layerize") layerize += 1;
    if (e.name === "Document::recalcStyle") {
      recalc += 1;
      recalcMs += e.dur / 1000;
    }
  }

  console.log(`\n--- ${label} ---`);
  console.log(
    `  BeginMainFrame x${beginMainFrame} (${beginMainMs.toFixed(0)}ms)   Paint x${paint}   Layerize x${layerize}`,
  );
  console.log(
    `  recalcStyle x${recalc} (${recalcMs.toFixed(0)}ms)   main_anim ${mainAnim}/${frames}   compositor_anim ${compAnim}   DROPPED ${dropped}`,
  );
  return { beginMainFrame, beginMainMs, mainAnim, frames, recalcMs };
};

console.log("Does the dot's CSS transition break its WAAPI compositing?");
const a = await runPhase("A) as shipped", false);
const b = await runPhase("B) dot transition: none", true);

console.log("\n=== verdict ===");
console.log(
  `  BeginMainFrame  x${a.beginMainFrame} (${a.beginMainMs.toFixed(0)}ms)  ->  x${b.beginMainFrame} (${b.beginMainMs.toFixed(0)}ms)`,
);
console.log(
  `  recalcStyle     ${a.recalcMs.toFixed(0)}ms  ->  ${b.recalcMs.toFixed(0)}ms`,
);
console.log(
  `  main-thread animation frames  ${a.mainAnim}/${a.frames}  ->  ${b.mainAnim}/${b.frames}`,
);

await browser.close();
