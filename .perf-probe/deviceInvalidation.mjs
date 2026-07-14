/**
 * The animations are innocent: with the track animating NOTHING, a ride still
 * costs ~450 BeginMainFrame / Paint / Layerize. And the same animation with no
 * ride is silent. So the RIDE — the app's own work — dirties the frame.
 *
 * Stop guessing and ask Chrome. `invalidationTracking` records every style /
 * layout / paint invalidation with its REASON, the node, and the JS stack that
 * caused it.
 *
 *   D) ride with ALL animations suppressed — is the main-frame storm still there?
 *   + the invalidation ledger for a normal ride.
 *
 *   node .perf-probe/deviceInvalidation.mjs
 */
import { chromium } from "playwright-core";

const CLICKS = 3;
const GAP_MS = 2300;
const RIDE_MS = 1900;

const CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "disabled-by-default-devtools.timeline.invalidationTracking",
  "disabled-by-default-devtools.timeline.stack",
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

const run = async (label, suppressAll) => {
  await page.goto("http://127.0.0.1:8080/on/", { waitUntil: "load" });
  await page.waitForTimeout(1800);

  if (suppressAll) {
    await page.evaluate(() => {
      const original = Element.prototype.animate;
      Element.prototype.animate = function patched(_keyframes, options) {
        return original.call(this, [], options); // animates nothing, finishes on time
      };
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
  let paint = 0;
  const reasons = new Map();
  const stacks = new Map();

  for (const e of events) {
    if (e.ph === "I" || e.ph === "X") {
      if (!inRide(toPageMs(e.ts))) continue;
      if (e.name === "ProxyMain::BeginMainFrame") beginMainFrame += 1;
      if (e.name === "Blink.Paint.UpdateTime") paint += 1;

      if (/InvalidationTracking/.test(e.name)) {
        const d = e.args?.data ?? {};
        const key = `${e.name.replace("InvalidationTracking", "")} | ${d.reason ?? d.changedAttribute ?? "?"} | ${d.nodeName ?? "?"}`;
        reasons.set(key, (reasons.get(key) ?? 0) + 1);
        const frame = d.stackTrace?.[0];
        if (frame) {
          const at = `${frame.functionName || "(anon)"} @ ${String(frame.url).split("/").pop()}:${frame.lineNumber}`;
          stacks.set(at, (stacks.get(at) ?? 0) + 1);
        }
      }
    }
  }

  console.log(`\n--- ${label} ---`);
  console.log(`  BeginMainFrame x${beginMainFrame}   Paint x${paint}`);
  console.log("  invalidations:");
  const top = [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (top.length === 0) console.log("    (none recorded)");
  for (const [key, n] of top) console.log(`    x${String(n).padStart(4)}  ${key}`);
  if (stacks.size > 0) {
    console.log("  caused by:");
    for (const [at, n] of [...stacks].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
      console.log(`    x${String(n).padStart(4)}  ${at}`);
    }
  }
};

console.log("Who dirties the frame during a ride?");
await run("A) normal ride", false);
await run("D) ride, ALL animations suppressed", true);

await browser.close();
