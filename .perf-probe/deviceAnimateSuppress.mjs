/**
 * The bisect proved the track's animation SHAPE is innocent: recreated by hand
 * on the same element, with every one of the app's quirks, it composites and
 * the main thread sleeps (BeginMainFrame x20 / 8s).
 *
 * So during a real ride something ELSE is main-ticked. §3.2 tried to rule out
 * the dots by removing them from the DOM — but removing an element does NOT
 * cancel its WAAPI animation. A detached element has no layout object, so its
 * animation CANNOT composite and stays a main-thread animation. That test was
 * flawed.
 *
 * Test it properly: suppress the animate() CALLS themselves.
 *
 *   A) everything animates (as shipped)
 *   B) only the TRACK may animate — every other animate() is cancelled at birth
 *   C) only the NON-track elements may animate — the track is not animated
 *
 *   node .perf-probe/deviceAnimateSuppress.mjs
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

const runPhase = async (label, mode) => {
  await page.goto("http://127.0.0.1:8080/on/", { waitUntil: "load" });
  await page.waitForTimeout(1800);

  // Install the suppressor BEFORE any ride starts.
  //
  // NOT via animation.cancel(): the bindings assign `animation.startTime` right
  // after animate(), and assigning startTime RESURRECTS a cancelled animation.
  // (That flaw made an earlier run report three identical phases.) Instead the
  // suppressed animation is created with an EMPTY keyframe list — same object,
  // same timing, same finish event, animating nothing.
  await page.evaluate((m) => {
    if (m === "all") return;
    const original = Element.prototype.animate;
    Element.prototype.animate = function patched(keyframes, options) {
      const isTrack = /slideContainer/.test(String(this.className ?? ""));
      const allowed = m === "track-only" ? isTrack : !isTrack;
      return original.call(this, allowed ? keyframes : [], options);
    };
  }, mode);

  const session = await browser.newBrowserCDPSession();
  await session.send("Tracing.start", {
    transferMode: "ReturnAsStream",
    traceConfig: { recordMode: "recordUntilFull", includedCategories: CATEGORIES },
  });

  const rides = [];
  let live = null;
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

    // Self-check: which animations are ACTUALLY animating something mid-ride?
    // Without this the suppressor can silently fail (and once did).
    if (i === 0) {
      await page.waitForTimeout(500);
      live = await page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => (a.effect?.getKeyframes?.() ?? []).length > 0)
          .map((a) =>
            /slideContainer/.test(String(a.effect.target?.className ?? ""))
              ? "track"
              : "other",
          ),
      );
      await page.waitForTimeout(GAP_MS - 500);
      continue;
    }
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
  let mainAnim = 0;
  let compAnim = 0;
  let frames = 0;

  for (const e of events) {
    if (e.name === "PipelineReporter" && e.ph === "b") {
      const r = e.args?.frame_reporter ?? e.args?.chrome_frame_reporter;
      if (!r?.state || !inRide(toPageMs(e.ts))) continue;
      frames += 1;
      if (r.has_main_animation) mainAnim += 1;
      if (r.has_compositor_animation) compAnim += 1;
      continue;
    }
    if (e.ph !== "X" || !e.dur || !inRide(toPageMs(e.ts))) continue;
    if (e.name === "ProxyMain::BeginMainFrame") {
      beginMainFrame += 1;
      beginMainMs += e.dur / 1000;
    }
    if (e.name === "Blink.Paint.UpdateTime") paint += 1;
    if (e.name === "Layerize") layerize += 1;
  }

  const actually = `${live.filter((k) => k === "track").length} track + ${live.filter((k) => k === "other").length} other`;
  console.log(
    `  ${label.padEnd(28)} [animating: ${actually.padEnd(16)}]` +
      `  BeginMainFrame x${String(beginMainFrame).padStart(3)} (${beginMainMs.toFixed(0).padStart(4)}ms)` +
      `  Paint x${String(paint).padStart(3)}  Layerize x${String(layerize).padStart(3)}` +
      `  main_anim ${String(mainAnim).padStart(4)}/${String(frames).padStart(4)}`,
  );
};

console.log("Which animate() call wakes the main thread during a ride?");
console.log("(4 rides; a composited-only ride should sit near x20)\n");

await runPhase("A) everything animates", "all");
await runPhase("B) TRACK only", "track-only");
await runPhase("C) everything EXCEPT track", "no-track");

await browser.close();
