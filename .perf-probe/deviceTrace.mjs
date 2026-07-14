/**
 * ON-DEVICE trace probe (phone Chrome over adb-forwarded CDP :9222).
 *
 *   node .perf-probe/deviceTrace.mjs click   — baseline: one Next click
 *   node .perf-probe/deviceTrace.mjs swipe   — one fast committing flick
 *   node .perf-probe/deviceTrace.mjs manual  — 20s window: swipe by hand
 *
 * Records devtools.timeline + frames, then reports per phase window:
 * painted frames, worst inter-frame gap, and every task > 25ms.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const scenario = process.argv[2] ?? "swipe";
const TRACE = `.perf-probe/out/device-${scenario}.json`;

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().includes("CarouselCC"));
if (!page) throw new Error("CarouselCC page not found on device");

await page.bringToFront();
await page.waitForTimeout(800);

const traceSession = await browser.newBrowserCDPSession();
await traceSession.send("Tracing.start", {
  transferMode: "ReturnAsStream",
  traceConfig: {
    recordMode: "recordUntilFull",
    includedCategories: [
      "devtools.timeline",
      "disabled-by-default-devtools.timeline",
      "disabled-by-default-devtools.timeline.frame",
      "blink.user_timing",
      "benchmark",
      "viz",
      "cc",
      "gpu",
      "toplevel",
      "latencyInfo",
    ],
  },
});

const cdp = await page.context().newCDPSession(page);

// Main-thread frame log: rAF timestamps — ground truth for the follow phase
// (finger writes are main-thread) and for any main-thread stall the eye sees.
await page.evaluate(() => {
  const w = window;
  w.__frameLog = [];
  const tick = (t) => {
    w.__frameLog.push(t);
    w.__frameLogId = requestAnimationFrame(tick);
  };
  w.__frameLogId = requestAnimationFrame(tick);
});

const touchSwipe = async (dx, moveMs, stickMs = 0) => {
  const rect = await page.evaluate(() => {
    const r = document
      .querySelector("[data-carousel-viewport]")
      .getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const startX = rect.x + rect.w * 0.75;
  const y = rect.y + rect.h / 2;
  const steps = 7;
  await page.evaluate(() => performance.mark("probe-press"));
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: startX, y }],
  });
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: startX - (dx * i) / steps, y }],
    });
    if (moveMs > 0) await page.waitForTimeout(moveMs / steps);
  }
  if (stickMs > 0) await page.waitForTimeout(stickMs);
  await page.evaluate(() => performance.mark("probe-release"));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
};

if (scenario === "click") {
  await page.evaluate(() => {
    performance.mark("probe-press");
    performance.mark("probe-release");
    document.querySelector('button[aria-label="Next slide"]').click();
  });
  await page.waitForTimeout(3000);
} else if (scenario === "swipe") {
  await touchSwipe(220, 110); // fast committing flick
  await page.waitForTimeout(2600);
} else {
  console.log(">>> ARMED: waiting up to 90s for the first touch... <<<");
  await page.evaluate(() => {
    window.__go = false;
    window.addEventListener(
      "touchstart",
      () => {
        performance.mark("probe-press");
        performance.mark("probe-release");
        window.__go = true;
      },
      { once: true, capture: true },
    );
  });
  await page.waitForFunction("window.__go === true", null, { timeout: 0 });
  console.log(">>> touch detected — recording 20s <<<");
  await page.waitForTimeout(20000);
}

const frameLog = await page.evaluate(() => {
  // eslint-disable-next-line no-console
  console.log("frameLog size", window.__frameLog?.length);
  cancelAnimationFrame(window.__frameLogId);
  return { frames: window.__frameLog, origin: performance.timeOrigin };
});
const pressTime = await page.evaluate(
  () => performance.getEntriesByName("probe-press")[0]?.startTime ?? 0,
);
const releaseTime = await page.evaluate(
  () => performance.getEntriesByName("probe-release")[0]?.startTime ?? 0,
);

const streamPromise = new Promise((resolve) =>
  traceSession.on("Tracing.tracingComplete", (e) => resolve(e.stream)),
);
await traceSession.send("Tracing.end");
const stream = await streamPromise;
let raw = "";
for (;;) {
  const chunk = await traceSession.send("IO.read", { handle: stream });
  raw += chunk.base64Encoded
    ? Buffer.from(chunk.data, "base64").toString("utf8")
    : chunk.data;
  if (chunk.eof) break;
}
await traceSession.send("IO.close", { handle: stream });
writeFileSync(TRACE, raw);
await browser.close();

// ---- analysis ---------------------------------------------------------------
const trace = JSON.parse(readFileSync(TRACE, "utf8"));
const events = trace.traceEvents ?? trace;

const mark = (name) =>
  events.find((e) => e.name === name && e.cat?.includes("blink.user_timing"));
const press = mark("probe-press");
const release = mark("probe-release");
if (!press) throw new Error("probe-press mark missing");
const t0 = press.ts;
const tRelease = (release?.ts ?? t0) - t0;
const rel = (ts) => Math.round((ts - t0) / 1000);

// Presented frames: modern Chrome reports them as PipelineReporter async
// begins whose reporter state is PRESENTED; the args key differs across
// Chrome builds (frame_reporter vs chrome_frame_reporter); fall back to
// legacy DrawFrame.
let frames = events
  .filter((e) => {
    if (e.name !== "PipelineReporter" || e.ph !== "b" || e.ts < t0 - 50_000)
      return false;
    const reporter = e.args?.frame_reporter ?? e.args?.chrome_frame_reporter;
    return /PRESENTED/.test(reporter?.state ?? "");
  })
  .map((e) => e.ts)
  .sort((a, b) => a - b);
if (frames.length === 0) {
  frames = events
    .filter((e) => e.name === "DrawFrame" && e.ts >= t0 - 50_000)
    .map((e) => e.ts)
    .sort((a, b) => a - b);
}

const windows =
  scenario === "manual"
    ? [["manual-20s", 0, 20000]]
    : [
        ["follow (press→release)", 0, tRelease / 1000],
        ["handoff (release +400ms)", tRelease / 1000, tRelease / 1000 + 400],
        ["ride tail", tRelease / 1000 + 400, tRelease / 1000 + 1600],
      ];

console.log(`scenario=${scenario}  release at +${Math.round(tRelease / 1000)}ms`);
for (const [label, fromMs, toMs] of windows) {
  const winFrames = frames.filter(
    (ts) => ts >= t0 + fromMs * 1000 && ts <= t0 + toMs * 1000,
  );
  let worstGap = 0;
  let worstAt = 0;
  for (let i = 1; i < winFrames.length; i += 1) {
    const gap = (winFrames[i] - winFrames[i - 1]) / 1000;
    if (gap > worstGap) {
      worstGap = gap;
      worstAt = rel(winFrames[i - 1]);
    }
  }
  const span = Math.max(1, toMs - fromMs);
  console.log(
    `${label}: frames=${winFrames.length} (~${Math.round(
      (winFrames.length / span) * 1000,
    )}fps), worst gap=${Math.round(worstGap)}ms at +${worstAt}ms`,
  );
}

const longTasks = events
  .filter(
    (e) =>
      e.ph === "X" &&
      e.dur > 25_000 &&
      e.ts > t0 - 50_000 &&
      e.ts < t0 + (scenario === "manual" ? 20000 : 4000) * 1000,
  )
  .sort((a, b) => b.dur - a.dur)
  .slice(0, 12);

{
  const relFrames = frameLog.frames.map((t) => t - pressTime);
  const phases =
    scenario === "manual"
      ? [["manual-20s (rAF)", 0, 20000]]
      : [
          ["follow (rAF)", 0, releaseTime - pressTime],
          ["handoff +400 (rAF)", releaseTime - pressTime, releaseTime - pressTime + 400],
          ["ride tail (rAF)", releaseTime - pressTime + 400, releaseTime - pressTime + 1600],
        ];
  console.log("\nmain-thread rAF frames:");
  for (const [label, fromMs, toMs] of phases) {
    const win = relFrames.filter((t) => t >= fromMs && t <= toMs);
    let worst = 0;
    let at = 0;
    for (let i = 1; i < win.length; i += 1) {
      const gap = win[i] - win[i - 1];
      if (gap > worst) { worst = gap; at = Math.round(win[i - 1]); }
    }
    const span = Math.max(1, toMs - fromMs);
    console.log(
      `  ${label}: frames=${win.length} (~${Math.round((win.length / span) * 1000)}fps), worst gap=${Math.round(worst)}ms at +${at}ms`,
    );
  }
}
console.log("\nlong tasks (>25ms):");
for (const task of longTasks) {
  const name =
    task.args?.data?.functionName ||
    task.args?.data?.url?.split("/").pop() ||
    task.name;
  console.log(
    `  +${rel(task.ts)}ms  ${Math.round(task.dur / 1000)}ms  ${name}`,
  );
}
