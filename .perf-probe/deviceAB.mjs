/**
 * A/B on the SAME device, driven by clicks (no user needed):
 *   A) widget mounted (as shipped)
 *   B) widget removed from the DOM at runtime
 *
 * Measures, per ride: main-thread style-recalc cost, BeginMainFrame cost, and
 * dropped compositor frames. If the widget's WAAPI dot animations run on the
 * MAIN thread, removing it should collapse the per-frame style recalc.
 *
 *   node .perf-probe/deviceAB.mjs
 */
import { chromium } from "playwright-core";

const CLICKS = 6;
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
  "v8",
  "v8.execute",
];

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().includes("CarouselCC"));
if (!page) throw new Error("CarouselCC page not found on device");
await page.bringToFront();

const runPhase = async (label, prepare) => {
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1600);
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
  const toPageMs = (us) => press + (us - mark.ts) / 1000;
  const inRide = (ms) => rides.some((s) => ms >= s && ms <= s + RIDE_MS);

  let presented = 0;
  let dropped = 0;
  let recalcN = 0;
  let recalcMs = 0;
  let mainMs = 0;

  for (const e of events) {
    if (e.name === "PipelineReporter" && e.ph === "b") {
      const r = e.args?.frame_reporter ?? e.args?.chrome_frame_reporter;
      if (!r?.state || !inRide(toPageMs(e.ts))) continue;
      if (/PRESENTED/.test(r.state)) presented += 1;
      if (/DROPPED/.test(r.state)) dropped += 1;
      continue;
    }
    if (e.ph !== "X" || !e.dur || !inRide(toPageMs(e.ts))) continue;
    if (e.name === "Document::recalcStyle") {
      recalcN += 1;
      recalcMs += e.dur / 1000;
    }
    if (e.name === "ProxyMain::BeginMainFrame") mainMs += e.dur / 1000;
  }

  console.log(
    `${label.padEnd(20)} presented ${String(presented).padStart(3)}  DROPPED ${String(dropped).padStart(2)}` +
      `  | recalcStyle x${String(recalcN).padStart(3)} = ${recalcMs.toFixed(0)}ms` +
      `  | BeginMainFrame ${mainMs.toFixed(0)}ms  (over ${((CLICKS * RIDE_MS) / 1000).toFixed(1)}s riding)`,
  );
  return { dropped, recalcN, recalcMs, mainMs };
};

console.log("A/B — is the pagination widget the per-frame style-recalc source?\n");
const a = await runPhase("A) widget MOUNTED", async () => {});
const b = await runPhase("B) widget REMOVED", async () => {
  await page.evaluate(() => {
    document
      .querySelectorAll('[class*="container_PW"]')
      .forEach((n) => n.remove());
  });
});

console.log(
  `\n=> widget removed: recalcStyle ${a.recalcMs.toFixed(0)}ms -> ${b.recalcMs.toFixed(0)}ms` +
    ` | BeginMainFrame ${a.mainMs.toFixed(0)}ms -> ${b.mainMs.toFixed(0)}ms` +
    ` | dropped ${a.dropped} -> ${b.dropped}`,
);

await browser.close();
