/**
 * A/B: does the JS controller's per-frame tick drag the main thread through a
 * full paint lifecycle behind a ride the COMPOSITOR is already painting?
 *
 *   A) isPassive: false  — controller ticks every frame (shipped behaviour)
 *   B) isPassive: true   — no frame loop while the compositor owns the paint
 *
 * Same build, same device, same rides; one line of source differs. Both
 * variants are served locally over `adb reverse`, so neither GH Pages caching
 * nor a second deploy can colour the result.
 *
 *   node .perf-probe/devicePassiveAB.mjs
 */
import { chromium } from "playwright-core";

const CLICKS = 6;
const GAP_MS = 2400;
const RIDE_MS = 1900;
const ORIGIN = "http://127.0.0.1:8080";

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
  "v8",
  "v8.execute",
];

/** The main-thread lifecycle work that must NOT happen during a composited ride. */
const LIFECYCLE = [
  "ProxyMain::BeginMainFrame",
  "WebFrameWidgetImpl::UpdateLifecycle",
  "LocalFrameView::RunPaintLifecyclePhase",
  "LocalFrameView::pushPaintArtifactToCompositor",
  "Blink.Paint.UpdateTime",
  "Blink.CompositingCommit.UpdateTime",
  "Layerize",
  "PaintArtifactCompositor::Update",
  "Document::recalcStyle",
  "FireAnimationFrame", // the tick itself — the thing under test
];

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().startsWith("http"));
if (!page) throw new Error("no page found on device");
await page.bringToFront();

const runPhase = async (label, variant) => {
  await page.goto(`${ORIGIN}/${variant}/`, { waitUntil: "load" });
  await page.waitForTimeout(2000);

  const session = await browser.newBrowserCDPSession();
  await session.send("Tracing.start", {
    transferMode: "ReturnAsStream",
    traceConfig: { recordMode: "recordUntilFull", includedCategories: CATEGORIES },
  });

  const rides = [];
  for (let i = 0; i < CLICKS; i += 1) {
    const t = await page.evaluate((first) => {
      if (first) {
        performance.clearMarks("probe-press"); // never reuse a stale anchor
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
  if (!mark) throw new Error(`${variant}: no probe-press mark in trace`);
  const toPageMs = (us) => press + (us - mark.ts) / 1000;
  const inRide = (ms) => rides.some((s) => ms >= s && ms <= s + RIDE_MS);

  const work = Object.fromEntries(LIFECYCLE.map((n) => [n, { n: 0, ms: 0 }]));
  let presented = 0;
  let dropped = 0;
  let composited = 0;

  for (const e of events) {
    if (e.name === "PipelineReporter" && e.ph === "b") {
      const r = e.args?.frame_reporter ?? e.args?.chrome_frame_reporter;
      if (!r?.state || !inRide(toPageMs(e.ts))) continue;
      if (/PRESENTED/.test(r.state)) presented += 1;
      if (/DROPPED/.test(r.state)) dropped += 1;
      if (r.has_compositor_animation) composited += 1;
      continue;
    }
    if (e.ph !== "X" || !e.dur || !inRide(toPageMs(e.ts))) continue;
    const slot = work[e.name];
    if (slot) {
      slot.n += 1;
      slot.ms += e.dur / 1000;
    }
  }

  const riding = (CLICKS * RIDE_MS) / 1000;
  console.log(`\n--- ${label} (${riding.toFixed(1)}s of riding) ---`);
  console.log(
    `  frames: presented ${presented}  DROPPED ${dropped}  composited ${composited}`,
  );
  for (const name of LIFECYCLE) {
    const { n, ms } = work[name];
    console.log(
      `  ${name.padEnd(46)} x${String(n).padStart(4)}  ${ms.toFixed(0).padStart(5)}ms`,
    );
  }
  return { work, dropped, presented };
};

console.log("A/B — is the per-frame controller tick the main-thread paint source?");
const a = await runPhase("A) isPassive:false — controller ticks every frame", "off");
const b = await runPhase("B) isPassive:true  — no frame loop while composited", "on");

console.log("\n=== verdict (main-thread work during composited rides) ===");
for (const name of LIFECYCLE) {
  const x = a.work[name];
  const y = b.work[name];
  const drop = x.ms > 0 ? `  (${(((x.ms - y.ms) / x.ms) * 100).toFixed(0)}% less)` : "";
  console.log(
    `  ${name.padEnd(46)} ${x.ms.toFixed(0).padStart(5)}ms -> ${y.ms.toFixed(0).padStart(5)}ms${drop}`,
  );
}
console.log(`\n  dropped frames: ${a.dropped} -> ${b.dropped}`);

await browser.close();
