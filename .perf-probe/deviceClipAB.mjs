/**
 * Hypothesis: the widget container's ROUNDED CLIP (overflow:hidden +
 * border-radius pill) prevents Chrome from compositing the dots, so their
 * WAAPI animations fall back to the MAIN thread and cost a full style recalc
 * every frame.
 *
 * Test each suspect in isolation, on the live page.
 */
import { chromium } from "playwright-core";

const CLICKS = 5;
const GAP_MS = 2400;
const RIDE_MS = 1900;

const CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "blink.user_timing",
  "blink",
  "cc",
  "viz",
  "benchmark",
  "toplevel",
];

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().includes("CarouselCC"));
if (!page) throw new Error("page not found");
await page.bringToFront();

const runPhase = async (label, mutate) => {
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1600);
  if (mutate) await page.evaluate(mutate);
  await page.waitForTimeout(300);

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
  const toPageMs = (us) => press + (us - mark.ts) / 1000;
  const inRide = (ms) => rides.some((s) => ms >= s + 80 && ms <= s + RIDE_MS);

  let n = 0;
  let ms = 0;
  let dropped = 0;
  for (const e of events) {
    if (e.name === "PipelineReporter" && e.ph === "b") {
      const r = e.args?.frame_reporter ?? e.args?.chrome_frame_reporter;
      if (r?.state && /DROPPED/.test(r.state) && inRide(toPageMs(e.ts))) dropped += 1;
      continue;
    }
    if (e.ph !== "X" || !e.dur) continue;
    if (e.name !== "Document::recalcStyle" || !inRide(toPageMs(e.ts))) continue;
    n += 1;
    ms += e.dur / 1000;
  }
  console.log(
    `${label.padEnd(38)} recalc x${String(n).padStart(3)} = ${ms.toFixed(0).padStart(4)}ms  (${(ms / Math.max(1, n)).toFixed(2)}ms each)  dropped ${dropped}`,
  );
};

const W = '[class*="container_PW"]';

console.log("Why can't the dots composite?\n");

await runPhase("A) as shipped (rounded clip)", null);

await runPhase("B) overflow: visible (clip off)", () => {
  document.querySelector('[class*="container_PW"]').style.overflow = "visible";
});

await runPhase("C) border-radius: 0 (square clip)", () => {
  document.querySelector('[class*="container_PW"]').style.borderRadius = "0px";
});

await runPhase("D) contain: none", () => {
  document.querySelector('[class*="container_PW"]').style.contain = "none";
});

await runPhase("E) overflow visible + radius 0", () => {
  const c = document.querySelector('[class*="container_PW"]');
  c.style.overflow = "visible";
  c.style.borderRadius = "0px";
});

await browser.close();
