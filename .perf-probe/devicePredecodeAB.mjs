/**
 * Correcting a confounded result. The "decode is innocent (1 ms)" measurement
 * was taken against a deploy that had isPredecodeOn={true} — so decode may have
 * been cheap BECAUSE the images were decoded ahead of the ride, not because
 * decode is harmless. That is a property of the setting, not of the system.
 *
 * A/B, one flag apart, both served locally:
 *   /on/  isPredecodeOn = true   (what is deployed)
 *   /off/ isPredecodeOn = false
 *
 * If OFF makes decode expensive and drops worse, predecode is earning its keep
 * and must stay. If both are the same, it is doing nothing.
 *
 *   node .perf-probe/devicePredecodeAB.mjs
 */
import { chromium } from "playwright-core";

const CLICKS = 5;
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

const runPhase = async (label, variant) => {
  await page.goto(`http://127.0.0.1:8080/${variant}/`, { waitUntil: "load" });
  await page.waitForTimeout(2500);

  const sanity = await page.evaluate(() => ({
    errorSlides: document.querySelectorAll('[class*="rror"]').length,
    button: Boolean(document.querySelector('button[aria-label="Next slide"]')),
  }));
  if (!sanity.button) throw new Error(`${label}: no Next button`);

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
  const rideOf = (ms) => rides.findIndex((s) => ms >= s && ms <= s + RIDE_MS);

  let presented = 0;
  let dropped = 0;
  let dropsAtStart = 0;
  let decodeN = 0;
  let decodeMs = 0;
  let rasterMs = 0;
  let mainMs = 0;

  for (const e of events) {
    if (e.name === "PipelineReporter" && e.ph === "b") {
      const r = e.args?.frame_reporter ?? e.args?.chrome_frame_reporter;
      const ms = toPageMs(e.ts);
      const ride = rideOf(ms);
      if (!r?.state || ride < 0) continue;
      if (/PRESENTED/.test(r.state)) presented += 1;
      if (/DROPPED/.test(r.state)) {
        dropped += 1;
        if ((ms - rides[ride]) / RIDE_MS < 0.2) dropsAtStart += 1;
      }
      continue;
    }
    if (e.ph !== "X" || !e.dur || rideOf(toPageMs(e.ts)) < 0) continue;
    if (/ImageDecodeTask|Decode Image|GpuImageDecode/.test(e.name)) {
      decodeN += 1;
      decodeMs += e.dur / 1000;
    }
    if (/Raster/.test(e.name)) rasterMs += e.dur / 1000;
    if (e.name === "ProxyMain::BeginMainFrame") mainMs += e.dur / 1000;
  }

  const total = presented + dropped;
  console.log(
    `  ${label.padEnd(26)} DROPPED ${String(dropped).padStart(2)}/${String(total).padStart(3)}` +
      ` (${((dropped / total) * 100).toFixed(1)}%, ${dropsAtStart} at start)` +
      `   decode x${String(decodeN).padStart(2)} ${decodeMs.toFixed(0).padStart(3)}ms` +
      `   raster ${rasterMs.toFixed(0).padStart(3)}ms   mainFrame ${mainMs.toFixed(0).padStart(3)}ms`,
  );
};

console.log("Is decode cheap because it is harmless — or because predecode hides it?\n");
await runPhase("A) isPredecodeOn TRUE", "on");
await runPhase("B) isPredecodeOn FALSE", "off");

await browser.close();
