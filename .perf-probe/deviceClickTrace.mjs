/**
 * Control experiment: BUTTON rides (which feel smooth) vs the swipe rides we
 * just captured. Same device, same page, same trace categories — the only
 * difference is what STARTS the motion. Clicks are driven through the DOM, so
 * no user and no OS input injection needed.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const CLICKS = 8;
const GAP_MS = 2400;

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
      "v8",
      "v8.execute",
    ],
  },
});

// Mark each click on the page clock — the same anchor scheme as the swipe run,
// so the analyzer can treat a click exactly like a "release".
await page.evaluate(() => {
  window.__deep = { touch: [], go: true };
});

console.log(`clicking Next x${CLICKS}...`);
for (let i = 0; i < CLICKS; i += 1) {
  await page.evaluate((first) => {
    if (first) performance.mark("probe-press");
    window.__deep.touch.push(["end", performance.now()]); // ride starts here
    document.querySelector('button[aria-label="Next slide"]')?.click();
  }, i === 0);
  await page.waitForTimeout(GAP_MS);
}

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
  `captured ${data.touch.length} click rides, trace ${(raw.length / 1e6).toFixed(1)} MB`,
);
console.log("now run:  node --max-old-space-size=8192 .perf-probe/deviceDropAnalyze.mjs");
