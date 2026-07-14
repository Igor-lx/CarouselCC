/**
 * The plain Pagination is fixed: its dot's CSS transition was fighting the WAAPI
 * fade over opacity/transform, and suppressing it during a planned step took a
 * ride from 452 main frames to 13.
 *
 * Does the WIDGET have the same disease? Its dots declare NO transition on
 * opacity/transform — only the container has `transition: width 0.3s`, a LAYOUT
 * property. So the same fix may not apply. Measure, then try the candidates.
 *
 * /off/ = a build with PaginationWidget mounted.
 *
 *   A) as shipped
 *   B) every transition in the widget killed
 *   C) widget dot animations truly killed (the known floor)
 *
 *   node .perf-probe/deviceWidgetTransition.mjs
 */
import { chromium } from "playwright-core";

const CLICKS = 4;
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

const runPhase = async (label, mode) => {
  await page.goto("http://127.0.0.1:8080/off/", { waitUntil: "load" });
  await page.waitForTimeout(1800);

  if (mode === "no-transition") {
    await page.evaluate(() => {
      const style = document.createElement("style");
      style.textContent = `[class*="_PW"], [class*="_PW"] * { transition: none !important; }`;
      document.head.appendChild(style);
    });
  }
  if (mode === "no-animations") {
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
  const inRide = (ms) => rides.some((s) => ms >= s && ms <= s + RIDE_MS);

  let beginMainFrame = 0;
  let beginMainMs = 0;
  let recalc = 0;
  let recalcMs = 0;
  let layout = 0;
  let mainAnim = 0;
  let frames = 0;

  for (const e of events) {
    if (e.name === "PipelineReporter" && e.ph === "b") {
      const r = e.args?.frame_reporter ?? e.args?.chrome_frame_reporter;
      if (!r?.state || !inRide(toPageMs(e.ts))) continue;
      frames += 1;
      if (r.has_main_animation) mainAnim += 1;
      continue;
    }
    if (e.ph !== "X" || !e.dur || !inRide(toPageMs(e.ts))) continue;
    if (e.name === "ProxyMain::BeginMainFrame") {
      beginMainFrame += 1;
      beginMainMs += e.dur / 1000;
    }
    if (e.name === "Document::recalcStyle") {
      recalc += 1;
      recalcMs += e.dur / 1000;
    }
    if (e.name === "Document::updateLayout") layout += 1;
  }

  console.log(
    `  ${label.padEnd(28)} BeginMainFrame x${String(beginMainFrame).padStart(3)} (${beginMainMs.toFixed(0).padStart(4)}ms)` +
      `  recalcStyle x${String(recalc).padStart(3)} (${recalcMs.toFixed(0).padStart(4)}ms, ${recalc ? (recalcMs / recalc).toFixed(2) : "0"}ms each)` +
      `  layout x${String(layout).padStart(3)}  main_anim ${String(mainAnim).padStart(3)}/${frames}`,
  );
};

console.log("PaginationWidget — same disease, or a different one?\n");
await runPhase("A) as shipped", "as-is");
await runPhase("B) all transitions killed", "no-transition");
await runPhase("C) dot animations killed", "no-animations");

await browser.close();
