/**
 * Before implementing the widget's value-quantisation: measure whether it can
 * possibly pay.
 *
 * Quantisation would round each dot's x/scale so several dots share a computed
 * style and Blink can reuse one ComputedStyle. But the dots sit tens of pixels
 * apart on the strip — rounding to half a pixel cannot make them coincide. So
 * the mechanism is doubtful on its face.
 *
 * This measures the CEILING of any dot-animation optimisation: kill the dot
 * animations outright. Nothing that keeps the widget's visual can beat that.
 *
 *   A) as shipped
 *   B) dot animations truly dead (the ceiling)
 *
 * If the dropped frames do not move, quantisation cannot help and must not be
 * written.
 *
 *   node .perf-probe/deviceWidgetCeiling.mjs
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

const runPhase = async (label, killDots) => {
  await page.goto("http://127.0.0.1:8080/on/", { waitUntil: "load" });
  await page.waitForTimeout(2200);

  if (killDots) {
    await page.evaluate(() => {
      const original = Element.prototype.animate;
      Element.prototype.animate = function patched(k, o) {
        const animation = original.call(this, k, o);
        if (/slideContainer/.test(String(this.className ?? ""))) return animation;
        animation.cancel();
        Object.defineProperty(animation, "startTime", {
          get: () => null,
          set: () => {},
          configurable: true,
        });
        Object.defineProperty(animation, "play", { value: () => {}, configurable: true });
        return animation;
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
  const rideOf = (ms) => rides.findIndex((s) => ms >= s && ms <= s + RIDE_MS);

  let presented = 0;
  let dropped = 0;
  let atStart = 0;
  let recalcN = 0;
  let recalcMs = 0;
  let mainN = 0;
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
        if ((ms - rides[ride]) / RIDE_MS < 0.2) atStart += 1;
      }
      continue;
    }
    if (e.ph !== "X" || !e.dur || rideOf(toPageMs(e.ts)) < 0) continue;
    if (e.name === "Document::recalcStyle") {
      recalcN += 1;
      recalcMs += e.dur / 1000;
    }
    if (e.name === "ProxyMain::BeginMainFrame") {
      mainN += 1;
      mainMs += e.dur / 1000;
    }
  }

  const total = presented + dropped;
  console.log(
    `  ${label.padEnd(26)} DROPPED ${String(dropped).padStart(2)}/${String(total).padStart(3)}` +
      ` (${((dropped / total) * 100).toFixed(1)}%, ${atStart} at start)` +
      `   recalc x${String(recalcN).padStart(2)} ${recalcMs.toFixed(0).padStart(3)}ms` +
      ` (${recalcN ? (recalcMs / recalcN).toFixed(2) : "0"}ms each)` +
      `   mainFrame x${String(mainN).padStart(2)} ${mainMs.toFixed(0).padStart(3)}ms`,
  );
  return dropped;
};

console.log("Can ANY dot-animation optimisation reduce the drops? (measure the ceiling)\n");
const a = await runPhase("A) as shipped", false);
const b = await runPhase("B) dot animations DEAD", true);
console.log(
  `\n=> dropped ${a} -> ${b}. If unchanged, quantisation cannot help — do not write it.`,
);

await browser.close();
