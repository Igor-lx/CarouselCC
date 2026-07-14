/**
 * Before blaming the track's animation, establish the FLOOR.
 *
 *   0) IDLE      — no ride at all. If the main thread already runs a lifecycle
 *                  every frame while nothing moves, then "per-frame main work
 *                  during a ride" is background noise, not a ride defect.
 *   A) RIDE      — the carousel's own composited ride, as shipped.
 *   B) BARE DIV  — a synthetic, textbook-compositable animation (translate3d,
 *                  will-change, no fill) on a fresh element, with the carousel
 *                  idle. This is what a *properly* composited animation costs
 *                  on THIS device. It is the number the ride should match.
 *
 * If B also runs a full lifecycle every frame, the premise is wrong and the
 * hunt is over. If B is quiet and A is not, the track's animation is genuinely
 * being main-ticked, and the difference between them is the bug.
 *
 *   node .perf-probe/deviceMainTickFloor.mjs
 */
import { chromium } from "playwright-core";

const WINDOW_MS = 9000;

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

const runPhase = async (label, drive) => {
  await page.goto("http://127.0.0.1:8080/on/", { waitUntil: "load" });
  await page.waitForTimeout(2000);

  const session = await browser.newBrowserCDPSession();
  await session.send("Tracing.start", {
    transferMode: "ReturnAsStream",
    traceConfig: { recordMode: "recordUntilFull", includedCategories: CATEGORIES },
  });

  const start = await page.evaluate(() => {
    performance.clearMarks("probe-press");
    performance.mark("probe-press");
    return performance.now();
  });
  await drive();
  await page.waitForTimeout(WINDOW_MS);

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
  const toPageMs = (us) => start + (us - mark.ts) / 1000;
  const inWindow = (ms) => ms >= start && ms <= start + WINDOW_MS;

  const work = Object.fromEntries(WORK.map((n) => [n, { n: 0, ms: 0 }]));
  let frames = 0;
  let mainAnim = 0;
  let compAnim = 0;

  for (const e of events) {
    if (e.name === "PipelineReporter" && e.ph === "b") {
      const r = e.args?.frame_reporter ?? e.args?.chrome_frame_reporter;
      if (!r?.state || !inWindow(toPageMs(e.ts))) continue;
      frames += 1;
      if (r.has_main_animation) mainAnim += 1;
      if (r.has_compositor_animation) compAnim += 1;
      continue;
    }
    if (e.ph !== "X" || !e.dur || !inWindow(toPageMs(e.ts))) continue;
    const slot = work[e.name];
    if (slot) {
      slot.n += 1;
      slot.ms += e.dur / 1000;
    }
  }

  console.log(`\n--- ${label} (${WINDOW_MS / 1000}s window) ---`);
  console.log(
    `  frames ${frames}   main_anim ${mainAnim}   compositor_anim ${compAnim}`,
  );
  for (const name of WORK) {
    const { n, ms } = work[name];
    console.log(
      `  ${name.padEnd(40)} x${String(n).padStart(4)}  ${ms.toFixed(0).padStart(5)}ms`,
    );
  }
  return work;
};

console.log("Floor check — what does a properly composited animation cost here?");

await runPhase("0) IDLE — nothing moving", async () => {});

await runPhase("A) RIDE — the carousel's own", async () => {
  for (let i = 0; i < 4; i += 1) {
    await page.evaluate(() =>
      document.querySelector('button[aria-label="Next slide"]')?.click(),
    );
    await page.waitForTimeout(2200);
  }
});

await runPhase("B) BARE DIV — textbook composited", async () => {
  await page.evaluate(() => {
    const box = document.createElement("div");
    box.style.cssText =
      "position:fixed;left:0;top:0;width:80px;height:80px;background:red;" +
      "will-change:transform;z-index:9999";
    document.body.appendChild(box);
    box.animate(
      [
        { transform: "translate3d(0px, 0, 0)" },
        { transform: "translate3d(300px, 0, 0)" },
      ],
      { duration: 8000, easing: "linear" },
    );
  });
});

await browser.close();
