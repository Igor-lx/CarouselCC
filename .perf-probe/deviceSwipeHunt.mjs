/**
 * The hitch survives at 10-15% of swipes (was ~70%). It is SWIPE-only, and the
 * user reports it MID-COAST — not at the moment the finger lifts.
 *
 * A swipe ride and a button ride run the same WAAPI machinery, so whatever is
 * left must live in what differs: the curve shape (launch velocity/inertia),
 * the duration, or the state the deck is in when the ride starts (the strip was
 * already moving, slides already mounted/unmounted mid-drag).
 *
 * This records REAL swipes and pins every event to its position INSIDE the ride:
 *
 *   - the handoff: last JS-painted position vs where the animation puts the
 *     strip at that same instant (the discontinuity, in pixels)
 *   - every dropped frame, as a % into the ride, with Chrome's flags
 *   - anything that happens mid-ride: animate() calls, slide mounts/unmounts,
 *     attribute churn, animation cancels
 *   - the keyframe curve actually handed to the compositor
 *
 * Non-invasive: it only writes performance marks and hooks writes. It never
 * READS a computed style (doing so forces a recalc every frame and poisons the
 * very thing being measured — that mistake was made once already).
 *
 *   node .perf-probe/deviceSwipeHunt.mjs
 */
import { chromium } from "playwright-core";

const WINDOW_MS = 20000;

const CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "blink.user_timing",
  "blink",
  "cc",
];

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
// Right after an adb forward is re-established, Playwright can report zero
// pages for a moment. Retry instead of dying on the race.
const findPage = async () => {
  // Chrome-on-Android reports the tab's url as "" over CDP after a reconnect,
  // so NEVER filter on it — that silently discarded the only live page and
  // cost three runs. The one test that holds: will the page actually run code?
  // A detached target will not, and a sleeping screen will hang, so race a
  // timeout rather than block forever.
  for (let attempt = 0; attempt < 15; attempt += 1) {
    for (const candidate of browser.contexts().flatMap((c) => c.pages())) {
      if (candidate.isClosed()) continue;
      const responds = await Promise.race([
        candidate.evaluate(() => true).catch(() => false),
        new Promise((r) => setTimeout(() => r(false), 3000)),
      ]);
      if (responds) return candidate;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("no live page on device — is the screen awake and unlocked?");
};
const page = await findPage();
await page.bringToFront();
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2500);
console.log("page:", page.url().slice(0, 60));

// ---- instrument the page (writes + marks only) ------------------------------
await page.evaluate(() => {
  const w = window;
  w.__hunt = { rides: [], drag: [], events: [] };

  const trackOf = (el) => /slideContainer/.test(String(el?.className ?? ""));
  const pxOf = (transform) => {
    const m = /translate3d\((-?[\d.]+)px/.exec(String(transform));
    return m ? parseFloat(m[1]) : null;
  };

  // Every inline transform write on the track = a JS-painted drag frame.
  const styleDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "style");
  Object.defineProperty(HTMLElement.prototype, "style", {
    get() {
      const decl = styleDescriptor.get.call(this);
      const el = this;
      if (!trackOf(el)) return decl;
      return new Proxy(decl, {
        set(target, prop, value) {
          if (prop === "transform") {
            const px = pxOf(value);
            if (px !== null) w.__hunt.drag.push([performance.now(), px]);
          }
          target[prop] = value;
          return true;
        },
        get(target, prop) {
          const v = target[prop];
          return typeof v === "function" ? v.bind(target) : v;
        },
      });
    },
    configurable: true,
  });

  // Every animation handed to the compositor.
  const originalAnimate = Element.prototype.animate;
  Element.prototype.animate = function patched(keyframes, options) {
    const animation = originalAnimate.call(this, keyframes, options);
    if (trackOf(this)) {
      const frames = (Array.isArray(keyframes) ? keyframes : []).map((f) =>
        pxOf(f.transform),
      );
      w.__hunt.rides.push({
        createdAt: performance.now(),
        startTime: null,
        duration: options?.duration ?? null,
        frames,
      });
      const ride = w.__hunt.rides[w.__hunt.rides.length - 1];
      queueMicrotask(() => {
        ride.startTime = animation.startTime;
      });
    } else {
      w.__hunt.events.push([performance.now(), "animate:other"]);
    }
    return animation;
  };

  // Anything structural happening mid-ride.
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "childList" && (r.addedNodes.length || r.removedNodes.length)) {
        w.__hunt.events.push([performance.now(), "slide mount/unmount"]);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  // Arm on the FIRST touch, so the recording covers the very first swipe.
  const arm = () => {
    performance.clearMarks("hunt-arm");
    performance.mark("hunt-arm");
    w.__hunt.armedAt = performance.now();
    document.removeEventListener("touchstart", arm, true);
  };
  document.addEventListener("touchstart", arm, true);
});

const session = await browser.newBrowserCDPSession();
await session.send("Tracing.start", {
  transferMode: "ReturnAsStream",
  traceConfig: { recordMode: "recordUntilFull", includedCategories: CATEGORIES },
});

console.log(`\n>>> SWIPE NOW — slowly, the way that reproduces the hitch (${WINDOW_MS / 1000}s) <<<\n`);
await page.waitForTimeout(WINDOW_MS);

const hunt = await page.evaluate(() => window.__hunt);

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
  (e) => e.name === "hunt-arm" && e.cat?.includes("blink.user_timing"),
);
if (!mark) throw new Error("never armed — no touch was seen");
const armedAt = hunt.armedAt;
const toPageMs = (us) => armedAt + (us - mark.ts) / 1000;

const drops = [];
for (const e of events) {
  if (e.name !== "PipelineReporter" || e.ph !== "b") continue;
  const r = e.args?.frame_reporter ?? e.args?.chrome_frame_reporter;
  if (!r?.state || !/DROPPED/.test(r.state)) continue;
  if (!r.affects_smoothness) continue; // bookkeeping FORKED frames are not visible
  drops.push({
    at: toPageMs(e.ts),
    flags: [
      r.has_main_animation ? "main_anim" : null,
      r.has_missing_content ? "MISSING_CONTENT" : null,
      r.checkerboarded_needs_raster ? "NEEDS_RASTER" : null,
      r.has_high_latency ? "high_latency" : null,
    ]
      .filter(Boolean)
      .join(" "),
  });
}

console.log(`captured ${hunt.rides.length} swipe rides, ${drops.length} smoothness-affecting drops\n`);

hunt.rides.forEach((ride, i) => {
  const start = ride.startTime ?? ride.createdAt;
  const end = start + (ride.duration ?? 0);
  const span = ride.frames.length ? ride.frames[ride.frames.length - 1] - ride.frames[0] : 0;

  // The handoff: the last JS-painted position before this ride was created,
  // against where the ride's own curve puts the strip at that instant.
  const lastDrag = [...hunt.drag].filter(([t]) => t <= ride.createdAt).pop();
  let handoff = "n/a";
  if (lastDrag && ride.frames.length) {
    const gapMs = ride.createdAt - lastDrag[0];
    const progress = Math.max(0, (ride.createdAt - start) / (ride.duration || 1));
    const idx = Math.min(
      ride.frames.length - 1,
      Math.round(progress * (ride.frames.length - 1)),
    );
    const jump = ride.frames[idx] - lastDrag[1];
    handoff = `gap ${gapMs.toFixed(0)}ms, JUMP ${jump.toFixed(1)}px`;
  }

  // CONTINUITY LAUNCH check. The config promises: "the release segment starts
  // at the VISUAL velocity the eye saw at lift-off". If the ride's opening
  // velocity is well BELOW the finger's, the strip BRAKES at release and then
  // re-accelerates — a stick, with every frame delivered on time. No drop
  // counter can see that; only this comparison can.
  const tail = hunt.drag.filter(([t]) => t <= ride.createdAt && t > ride.createdAt - 60);
  let launch = "n/a";
  if (tail.length >= 2 && ride.frames.length >= 2 && ride.duration) {
    const [t0, x0] = tail[0];
    const [t1, x1] = tail[tail.length - 1];
    const fingerPxPerMs = Math.abs((x1 - x0) / Math.max(1, t1 - t0));
    const stepMs = ride.duration / (ride.frames.length - 1);
    const ridePxPerMs = Math.abs(ride.frames[1] - ride.frames[0]) / stepMs;
    const ratio = fingerPxPerMs > 0.01 ? ridePxPerMs / fingerPxPerMs : NaN;
    const verdict = ratio < 0.6 ? "  <<< BRAKES AT RELEASE" : "";
    launch =
      `finger ${(fingerPxPerMs * 16.7).toFixed(1)}px/frame -> ride opens at ` +
      `${(ridePxPerMs * 16.7).toFixed(1)}px/frame  (${(ratio * 100).toFixed(0)}% of it)${verdict}`;
  }
  console.log(`    launch:  ${launch}`);

  const step = ride.duration / (ride.frames.length - 1);
  const speeds = ride.frames
    .slice(1)
    .map((x, k) => Math.abs(x - ride.frames[k]) / step * 16.7);
  console.log(
    `    px/frame: ${speeds.map((v) => v.toFixed(0).padStart(3)).join(" ")}`,
  );

  const mine = drops.filter((d) => d.at >= start && d.at <= end);
  console.log(`--- ride #${i + 1}: ${Math.abs(span).toFixed(0)}px over ${ride.duration}ms ---`);
  console.log(`    handoff: ${handoff}`);
  if (mine.length === 0) {
    console.log(`    dropped frames: none`);
  } else {
    for (const d of mine) {
      const into = ((d.at - start) / (ride.duration || 1)) * 100;
      console.log(
        `    DROP at ${into.toFixed(0).padStart(3)}% into the ride   ${d.flags || "(no flags)"}`,
      );
    }
  }
  const midEvents = hunt.events.filter(([t]) => t >= start && t <= end);
  if (midEvents.length) {
    const counts = new Map();
    for (const [, name] of midEvents) counts.set(name, (counts.get(name) ?? 0) + 1);
    console.log(
      `    mid-ride work: ${[...counts].map(([n, c]) => `${n} x${c}`).join(", ")}`,
    );
  }
});

await browser.close();
