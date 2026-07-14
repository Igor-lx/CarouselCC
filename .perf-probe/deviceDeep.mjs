/**
 * NON-INVASIVE hitch hunt.
 *
 *   node .perf-probe/deviceDeep.mjs        (arms; swipe when it says so)
 *
 * The eye sees what the COMPOSITOR presents. A dropped compositor frame = the
 * screen repeats the previous image for one vsync = one micro-hitch. So we do
 * NOT sample the transform per frame (getComputedStyle forces a style recalc
 * every frame and would pollute the very main thread we are measuring). We
 * only mark the touches and let the browser trace tell the whole story.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const RECORD_MS = 20000;

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().includes("CarouselCC"));
if (!page) throw new Error("CarouselCC page not found on device");

await page.bringToFront();
await page.waitForTimeout(400);

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
      "blink",
      "cc",
      "gpu",
      "viz",
      "benchmark",
      "toplevel",
      "latencyInfo",
      "v8",
      "v8.execute",
    ],
  },
});

// Touch marks ONLY — zero per-frame work, zero style reads.
await page.evaluate(() => {
  const w = window;
  w.__deep = { touch: [], go: false };
  addEventListener(
    "touchstart",
    () => {
      if (!w.__deep.go) {
        w.__deep.go = true;
        performance.mark("probe-press"); // shared clock anchor with the trace
      }
      w.__deep.touch.push(["start", performance.now()]);
    },
    { capture: true },
  );
  addEventListener(
    "touchend",
    () => w.__deep.go && w.__deep.touch.push(["end", performance.now()]),
    { capture: true },
  );
});

console.log(">>> ARMED: swipe now — recording starts on your first touch <<<");
await page.waitForFunction("window.__deep.go === true", null, { timeout: 0 });
console.log(`>>> touch detected — recording ${RECORD_MS / 1000}s <<<`);
await page.waitForTimeout(RECORD_MS);

const data = await page.evaluate(() => ({
  touch: window.__deep.touch,
  press: performance.getEntriesByName("probe-press")[0]?.startTime ?? 0,
}));

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
await browser.close();

writeFileSync(".perf-probe/out/deep-trace.json", raw);
writeFileSync(".perf-probe/out/deep-pos.json", JSON.stringify({ ...data, pos: [] }));
console.log(
  `captured: ${data.touch.length} touch events, trace ${(raw.length / 1e6).toFixed(1)} MB`,
);
console.log("now run:  node --max-old-space-size=8192 .perf-probe/deviceDropAnalyze.mjs");
