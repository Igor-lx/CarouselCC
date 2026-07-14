/**
 * A bare composited animation costs 20 main frames / 9s on this device.
 * The carousel's ride costs 498. The difference is somewhere between them.
 *
 * Bisect: animate the TRACK ELEMENT ITSELF with a synthetic animation, adding
 * one difference at a time. The app's own animation is cancelled first, and no
 * ride is triggered — so the only thing under test is the animation's shape.
 *
 *   T0  bare div (control, off-tree)
 *   T1  track element, 2 keyframes, no fill, no inline transform
 *   T2  T1 + fill: "both"
 *   T3  T1 + 33 keyframes
 *   T4  T1 + inline style.transform written before animate()
 *   T5  T1 + startTime pinned into the past
 *   T6  everything (what the app actually does)
 *
 * Whichever step wakes the main thread is the bug.
 *
 *   node .perf-probe/deviceTrackBisect.mjs
 */
import { chromium } from "playwright-core";

const WINDOW_MS = 8000;

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
];

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().startsWith("http"));
if (!page) throw new Error("no page found on device");
await page.bringToFront();

const runVariant = async (label, spec) => {
  await page.goto("http://127.0.0.1:8080/on/", { waitUntil: "load" });
  await page.waitForTimeout(1800);

  const session = await browser.newBrowserCDPSession();
  await session.send("Tracing.start", {
    transferMode: "ReturnAsStream",
    traceConfig: { recordMode: "recordUntilFull", includedCategories: CATEGORIES },
  });

  const start = await page.evaluate((s) => {
    performance.clearMarks("probe-press");
    performance.mark("probe-press");

    const track = document.querySelector('[class*="slideContainer"]');
    document.getAnimations().forEach((a) => a.cancel());

    let target = track;
    if (s.bareDiv) {
      const box = document.createElement("div");
      box.style.cssText =
        "position:fixed;left:0;top:0;width:80px;height:80px;background:red;" +
        "will-change:transform;z-index:9999";
      document.body.appendChild(box);
      target = box;
    }

    const from = 0;
    const to = -600;
    const count = s.keyframes;
    const frames = Array.from({ length: count }, (_, i) => {
      const p = count === 1 ? 1 : i / (count - 1);
      return { transform: `translate3d(${(from + (to - from) * p).toFixed(2)}px, 0, 0)` };
    });

    if (s.inlineTransform) target.style.transform = frames[0].transform;

    const animation = target.animate(frames, {
      duration: 8000,
      easing: "linear",
      ...(s.fill ? { fill: "both" } : {}),
    });
    if (s.pinStartTime) animation.startTime = document.timeline.currentTime - 16;

    return performance.now();
  }, spec);

  await page.waitForTimeout(WINDOW_MS);

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
  const toPageMs = (us) => start + (us - mark.ts) / 1000;
  const inWindow = (ms) => ms >= start && ms <= start + WINDOW_MS;

  let beginMainFrame = 0;
  let paint = 0;
  let mainAnim = 0;
  let compAnim = 0;
  let frames = 0;

  for (const e of events) {
    if (e.name === "PipelineReporter" && e.ph === "b") {
      const r = e.args?.frame_reporter ?? e.args?.chrome_frame_reporter;
      if (!r?.state || !inWindow(toPageMs(e.ts))) continue;
      frames += 1;
      if (r.has_main_animation) mainAnim += 1;
      if (r.has_compositor_animation) compAnim += 1;
      continue;
    }
    if (e.ph !== "X" || !e.dur || !inWindow(toPageMs(e.ts))) continue;
    if (e.name === "ProxyMain::BeginMainFrame") beginMainFrame += 1;
    if (e.name === "Blink.Paint.UpdateTime") paint += 1;
  }

  const verdict = beginMainFrame > 150 ? "MAIN-TICKED" : "quiet";
  console.log(
    `  ${label.padEnd(46)} BeginMainFrame x${String(beginMainFrame).padStart(3)}` +
      `  Paint x${String(paint).padStart(3)}` +
      `  main_anim ${String(mainAnim).padStart(4)}/${String(frames).padStart(4)}` +
      `  comp ${String(compAnim).padStart(4)}   ${verdict}`,
  );
};

console.log("Bisect: which property of the track animation wakes the main thread?");
console.log("(8s window; a properly composited animation should sit near x20)\n");

await runVariant("T0  bare div, 2kf, no fill", { bareDiv: true, keyframes: 2 });
await runVariant("T1  TRACK, 2kf, no fill", { keyframes: 2 });
await runVariant("T2  TRACK, 2kf, fill:both", { keyframes: 2, fill: true });
await runVariant("T3  TRACK, 33kf, no fill", { keyframes: 33 });
await runVariant("T4  TRACK, 2kf, inline transform first", {
  keyframes: 2,
  inlineTransform: true,
});
await runVariant("T5  TRACK, 2kf, startTime pinned", { keyframes: 2, pinStartTime: true });
await runVariant("T6  TRACK, 33kf + fill + inline + pinned", {
  keyframes: 33,
  fill: true,
  inlineTransform: true,
  pinStartTime: true,
});

await browser.close();
