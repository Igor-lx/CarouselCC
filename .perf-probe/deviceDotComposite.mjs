/**
 * Killing the dot animations returns the main thread to idle (x453 -> x54,
 * main_anim 895 -> 0). So the dots are the source. But WHY does a dot's
 * opacity+transform animation — with will-change set — refuse to composite?
 *
 * If the blocker is the dot's own style, the fix must change the dot. If the
 * blocker is its CONTAINER (clip / overflow / stacking), the fix can leave the
 * visual completely intact. Find out which.
 *
 * No ride is triggered: a synthetic animation is put on a dot by hand, so the
 * only variable is the environment.
 *
 *   node .perf-probe/deviceDotComposite.mjs
 */
import { chromium } from "playwright-core";

const WINDOW_MS = 6000;

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

const runVariant = async (label, spec) => {
  await page.goto("http://127.0.0.1:8080/on/", { waitUntil: "load" });
  await page.waitForTimeout(1600);

  const setup = await page.evaluate((s) => {
    performance.clearMarks("probe-press");
    performance.mark("probe-press");
    document.getAnimations().forEach((a) => a.cancel());

    const dot = document.querySelector('[class*="_dot_"]');
    if (!dot) return { error: "no dot" };
    const strip = dot.parentElement;
    const container = strip?.parentElement;

    const before = {
      stripOverflow: getComputedStyle(strip).overflow,
      stripRadius: getComputedStyle(strip).borderRadius,
      stripTransform: getComputedStyle(strip).transform,
      containerOverflow: container ? getComputedStyle(container).overflow : "-",
    };

    if (s.unclipStrip) {
      strip.style.overflow = "visible";
      strip.style.borderRadius = "0";
      strip.style.clipPath = "none";
      strip.style.mask = "none";
      strip.style.webkitMaskImage = "none";
    }
    if (s.unclipContainer && container) {
      container.style.overflow = "visible";
      container.style.borderRadius = "0";
    }
    if (s.detach) document.body.appendChild(dot);

    const targets = s.noDots ? [] : s.allDots
      ? [...document.querySelectorAll('[class*="_dot_"]')]
      : [dot];

    // Optionally animate the TRACK too — the app always does, and the dots are
    // only ever measured alongside it.
    if (s.withTrack) {
      const track = document.querySelector('[class*="slideContainer"]');
      const trackFrames = Array.from({ length: 33 }, (_, k) => ({
        transform: `translate3d(${(-600 * (k / 32)).toFixed(2)}px, 0, 0)`,
      }));
      track.animate(trackFrames, { duration: 6000, easing: "linear", fill: "both" });
    }

    // Dirty the style in the SAME task, right before animate() — this is what
    // a React commit does (it mutates dot[class], then a layout effect animates).
    // Blink decides compositability when the animation starts.
    if (s.dirtyBefore) {
      targets.forEach((t) => {
        t.setAttribute("class", `${t.getAttribute("class")} probeDirty`);
      });
    }

    const count = s.keyframes ?? 2;
    targets.forEach((t, i) => {
      const frames = Array.from({ length: count }, (_, k) => {
        const p = count === 1 ? 1 : k / (count - 1);
        const lane = s.identical ? 0 : i;
        return {
          opacity: String(0.8 - 0.4 * p - lane * 0.02),
          transform: `scaleX(${(1 + 0.5 * p + lane * 0.03).toFixed(4)})`,
        };
      });
      const animation = t.animate(frames, {
        duration: 6000,
        easing: "linear",
        ...(s.fill ? { fill: "both" } : {}),
      });
      if (s.pin) animation.startTime = document.timeline.currentTime - 16;
    });

    // Mid-flight class change — exactly what React does to the active dot
    // (the ride mutates dot[class] twice). Does it knock the animation off the
    // compositor for the rest of the ride?
    if (s.touchClass) {
      setTimeout(() => {
        targets.forEach((t) => {
          t.setAttribute("class", `${t.getAttribute("class")} probeTouched`);
        });
      }, 800);
    }

    return { before, count: targets.length };
  }, spec);

  if (setup.error) throw new Error(setup.error);

  const session = await browser.newBrowserCDPSession();
  await session.send("Tracing.start", {
    transferMode: "ReturnAsStream",
    traceConfig: { recordMode: "recordUntilFull", includedCategories: CATEGORIES },
  });
  const start = await page.evaluate(() => performance.now());
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
  let beginMainFrame = 0;
  let mainAnim = 0;
  let compAnim = 0;
  let frames = 0;
  for (const e of events) {
    if (e.name === "PipelineReporter" && e.ph === "b") {
      const r = e.args?.frame_reporter ?? e.args?.chrome_frame_reporter;
      if (!r?.state) continue;
      frames += 1;
      if (r.has_main_animation) mainAnim += 1;
      if (r.has_compositor_animation) compAnim += 1;
      continue;
    }
    if (e.ph === "X" && e.name === "ProxyMain::BeginMainFrame") beginMainFrame += 1;
  }

  const verdict = mainAnim > frames * 0.5 ? "MAIN-THREAD" : "composited";
  console.log(
    `  ${label.padEnd(40)} BeginMainFrame x${String(beginMainFrame).padStart(3)}` +
      `  main_anim ${String(mainAnim).padStart(4)}/${String(frames).padStart(4)}` +
      `  comp ${String(compAnim).padStart(4)}   ${verdict}`,
  );
  return setup.before;
};

console.log("Why won't a dot's opacity+transform animation composite?\n");

const styles = await runVariant("1  one dot, as-is", {});
await runVariant("2  one dot, strip unclipped", { unclipStrip: true });
await runVariant("3  one dot, strip+container unclipped", {
  unclipStrip: true,
  unclipContainer: true,
});
await runVariant("4  one dot, detached to <body>", { detach: true });
await runVariant("5  all dots, identical values, 2kf", {
  allDots: true,
  identical: true,
});
await runVariant("6  all dots, distinct values, 2kf", { allDots: true });
await runVariant("7  all dots, distinct, 33kf", { allDots: true, keyframes: 33 });
await runVariant("8  all dots, distinct, 2kf, fill:both", { allDots: true, fill: true });
await runVariant("9  all dots, distinct, 2kf, pinned", { allDots: true, pin: true });
await runVariant("10 all dots, 33kf + fill + pinned (app)", {
  allDots: true,
  keyframes: 33,
  fill: true,
  pin: true,
});

// The app never runs the dots alone: the track animates alongside them. Two
// composited animations may not stay composited together.
await runVariant("11 TRACK alone, no dots", { withTrack: true, noDots: true });
await runVariant("12 TRACK + all dots (a real ride)", {
  allDots: true,
  keyframes: 33,
  fill: true,
  pin: true,
  withTrack: true,
});

// The ride mutates dot[class] twice (React moves the active-dot class). A style
// change on an element with a running composited animation may knock it onto
// the main thread for the rest of the ride.
await runVariant("13 TRACK + dots, class touched mid-flight", {
  allDots: true,
  keyframes: 33,
  fill: true,
  pin: true,
  withTrack: true,
  touchClass: true,
});

// Order matters: variant 13 dirtied the style AFTER animate(). A React commit
// does the opposite — it mutates the class, then a layout effect animates in
// the same task, while style is still dirty.
await runVariant("14 dirty style, THEN animate (React order)", {
  allDots: true,
  keyframes: 33,
  fill: true,
  pin: true,
  withTrack: true,
  dirtyBefore: true,
});

console.log("\nstrip/container computed styles:");
console.log(` ${JSON.stringify(styles)}`);

await browser.close();
