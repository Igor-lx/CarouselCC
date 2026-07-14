/**
 * Narrow down WHAT in the widget makes every style recalc 30x more expensive.
 *
 *   A) as shipped
 *   B) dot WAAPI animations cancelled (DOM kept, static styles kept)
 *   C) `will-change` stripped from dots/overlays (animations kept)
 *   D) widget removed entirely (known floor)
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

const runPhase = async (label, duringRide) => {
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1600);

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
    // Apply the mutation just AFTER the ride starts, so it acts on the live
    // animations of this very ride.
    await page.waitForTimeout(60);
    if (duringRide) await page.evaluate(duringRide);
    await page.waitForTimeout(GAP_MS - 60);
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

  let recalcN = 0;
  let recalcMs = 0;
  let dropped = 0;
  for (const e of events) {
    if (e.name === "PipelineReporter" && e.ph === "b") {
      const r = e.args?.frame_reporter ?? e.args?.chrome_frame_reporter;
      if (r?.state && /DROPPED/.test(r.state) && inRide(toPageMs(e.ts))) dropped += 1;
      continue;
    }
    if (e.ph !== "X" || !e.dur) continue;
    if (e.name !== "Document::recalcStyle" || !inRide(toPageMs(e.ts))) continue;
    recalcN += 1;
    recalcMs += e.dur / 1000;
  }
  console.log(
    `${label.padEnd(34)} recalcStyle x${String(recalcN).padStart(3)} = ${recalcMs.toFixed(0).padStart(4)}ms` +
      `  (${(recalcMs / Math.max(1, recalcN)).toFixed(2)}ms each)   dropped ${dropped}`,
  );
};

console.log("What in the widget makes style recalc expensive?\n");

await runPhase("A) as shipped", null);

await runPhase("B) dot animations CANCELLED", () => {
  document.getAnimations().forEach((a) => {
    const el = a.effect?.target;
    if (el && el.className && /dot|_PW/.test(String(el.className))) a.cancel();
  });
});

await runPhase("C) will-change stripped from dots", () => {
  document.querySelectorAll('[class*="dot"], [class*="Dot"]').forEach((n) => {
    n.style.willChange = "auto";
  });
});

await runPhase("D) widget REMOVED (floor)", () => {
  document.querySelectorAll('[class*="container_PW"]').forEach((n) => n.remove());
});

await browser.close();
