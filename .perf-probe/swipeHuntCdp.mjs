/**
 * The swipe hunt, on RAW CDP — no Playwright.
 *
 * Playwright's connectOverCDP kept reporting the Android tab with an empty url
 * and then refusing to run anything in it, while raw CDP answered instantly.
 * Five runs died on that. So talk to Chrome directly.
 *
 * What it does: arms on your FIRST touch (no countdown to race), records 20s of
 * real swipes on the LIVE deploy, and answers one question the frame counters
 * cannot:
 *
 *   Does the ride open at the velocity the strip VISIBLY had at lift-off?
 *
 * The config promises exactly that ("the release segment starts at the VISUAL
 * velocity the eye saw at lift-off"). If the ride opens slower, the strip BRAKES
 * at release and re-accelerates over the first 25% of the distance — a stick,
 * with every frame delivered on time and zero frames dropped. No drop counter
 * can see it; only this comparison can.
 *
 *   node .perf-probe/swipeHuntCdp.mjs
 */
const RECORD_MS = 20000;

const CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "blink.user_timing",
  "blink",
  "cc",
];

// ---- minimal CDP client -----------------------------------------------------
const connect = async (url) => {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let nextId = 1;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
      return;
    }
    for (const listener of listeners) listener(data);
  };
  return {
    send: (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      }),
    on: (listener) => listeners.push(listener),
    close: () => ws.close(),
  };
};

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const pageTarget = targets.find((t) => t.type === "page");
if (!pageTarget) throw new Error("no page target on device");
const version = await (await fetch("http://127.0.0.1:9222/json/version")).json();

const page = await connect(pageTarget.webSocketDebuggerUrl);
const browser = await connect(version.webSocketDebuggerUrl);

const evaluate = async (expression) => {
  const result = await page.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? "eval failed");
  }
  return result.result.value;
};

console.log(`page: ${pageTarget.url.slice(0, 55)}`);

// ---- instrument (writes + marks only; never READS a computed style) ---------
const instrument = () =>
  evaluate(`(() => {
  const w = window;
  w.__hunt = { rides: [], drag: [], armedAt: null };

  const isTrack = (el) => /slideContainer/.test(String(el && el.className || ""));
  const pxOf = (t) => {
    const m = /translate3d\\((-?[\\d.]+)px/.exec(String(t));
    return m ? parseFloat(m[1]) : null;
  };

  const styleDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "style");
  Object.defineProperty(HTMLElement.prototype, "style", {
    get() {
      const decl = styleDescriptor.get.call(this);
      if (!isTrack(this)) return decl;
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

  const originalAnimate = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    const animation = originalAnimate.call(this, keyframes, options);
    if (isTrack(this)) {
      w.__hunt.rides.push({
        createdAt: performance.now(),
        duration: (options && options.duration) || null,
        frames: (Array.isArray(keyframes) ? keyframes : []).map((f) => pxOf(f.transform)),
      });
    }
    return animation;
  };

  // The FINGER itself, straight from the hardware timestamps. The painted
  // positions alone cannot tell "the finger stopped" from "the strip stopped
  // painting while the finger kept going" — and those need opposite fixes.
  w.__hunt.touch = [];
  const onTouch = (e) => {
    const t = e.touches[0] || e.changedTouches[0];
    if (t) w.__hunt.touch.push([e.timeStamp, t.clientX, e.type]);
  };
  document.addEventListener("touchmove", onTouch, { capture: true, passive: true });
  document.addEventListener("touchend", onTouch, { capture: true, passive: true });

  // Chrome-on-Android turns the vertical component of a swipe into a
  // pull-to-refresh. It reloaded the page mid-recording and took the whole
  // session with it, twice. Measurement-only: never ship this.
  document.documentElement.style.overscrollBehaviorY = "contain";
  document.body.style.overscrollBehaviorY = "contain";

  const arm = () => {
    w.__hunt.armedAt = performance.now();
    document.removeEventListener("touchstart", arm, true);
  };
  document.addEventListener("touchstart", arm, true);
  return true;
})()`);

await instrument();

await browser.send("Tracing.start", {
  transferMode: "ReturnAsStream",
  traceConfig: { recordMode: "recordUntilFull", includedCategories: CATEGORIES },
});

console.log("\n>>> ARMED — recording starts on your FIRST touch, then runs 20s <<<\n");
for (;;) {
  // The page can reload (or be reloaded) before the first touch — guard, and
  // re-arm rather than dying on an undefined.
  const state = await evaluate(
    "window.__hunt ? (window.__hunt.armedAt ? 'armed' : 'waiting') : 'gone'",
  );
  if (state === "armed") break;
  if (state === "gone") {
    console.log("    (page reloaded before the first touch — re-arming)");
    await instrument();
  }
  await new Promise((r) => setTimeout(r, 400));
}
console.log(">>> touch seen — RECORDING: swipe slowly, 20s <<<\n");

// Drain as we go. A pull-to-refresh (Chrome's, from the vertical component of a
// swipe) wipes the page context and everything collected with it — reading only
// at the end lost a whole session that way. Poll, keep what we have, and
// re-instrument if the context is replaced.
const hunt = { rides: [], drag: [], touch: [] };
const deadline = Date.now() + RECORD_MS;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 1200));

  // Drain AND clear, so each poll takes only what is new. Replacing a local
  // snapshot instead of accumulating is what let one reload wipe a whole
  // session: the page came back empty and the empty won.
  const snapshot = await evaluate(`(() => {
    const h = window.__hunt;
    if (!h) return null;
    const out = JSON.stringify({ rides: h.rides, drag: h.drag, touch: h.touch });
    h.rides = [];
    h.drag = [];
    h.touch = [];
    return out;
  })()`);

  if (snapshot === null) {
    console.log("    (page reloaded — re-instrumenting; keeping what we already drained)");
    await instrument();
    continue;
  }
  const parsed = JSON.parse(snapshot);
  hunt.rides.push(...parsed.rides);
  hunt.drag.push(...parsed.drag);
  hunt.touch.push(...(parsed.touch ?? []));
}

const streamPromise = new Promise((resolve) =>
  browser.on((m) => {
    if (m.method === "Tracing.tracingComplete") resolve(m.params.stream);
  }),
);
await browser.send("Tracing.end");
const stream = await streamPromise;
let raw = "";
for (;;) {
  const chunk = await browser.send("IO.read", { handle: stream });
  raw += chunk.base64Encoded
    ? Buffer.from(chunk.data, "base64").toString("utf8")
    : chunk.data;
  if (chunk.eof) break;
}
await browser.send("IO.close", { handle: stream });

// ---- analysis ---------------------------------------------------------------
const events = JSON.parse(raw).traceEvents ?? [];
const drops = [];
for (const e of events) {
  if (e.name !== "PipelineReporter" || e.ph !== "b") continue;
  const r = e.args?.frame_reporter ?? e.args?.chrome_frame_reporter;
  if (!r?.state || !/DROPPED/.test(r.state) || !r.affects_smoothness) continue;
  drops.push(e.ts / 1000); // trace ms; only used for counting per ride below
}

console.log(`captured ${hunt.rides.length} swipe rides\n`);

for (const [i, ride] of hunt.rides.entries()) {
  if (!ride.duration || ride.frames.length < 2) continue;

  const step = ride.duration / (ride.frames.length - 1);
  const speeds = ride.frames
    .slice(1)
    .map((x, k) => (Math.abs(x - ride.frames[k]) / step) * 16.7);

  // What the finger was ACTUALLY doing in its last 60 ms — from the positions
  // the app itself painted, not from any estimator.
  // Measure the strip's REAL visual speed over several windows. A 60ms average
  // over a decelerating finger overstates the speed at the instant of lift-off,
  // which would fake a "brake" that isn't there. The short windows settle that.
  const windowSpeed = (ms) => {
    const tail = hunt.drag.filter(
      ([t]) => t <= ride.createdAt && t > ride.createdAt - ms,
    );
    if (tail.length < 2) return null;
    const [t0, x0] = tail[0];
    const [t1, x1] = tail[tail.length - 1];
    return (Math.abs(x1 - x0) / Math.max(1, t1 - t0)) * 16.7;
  };

  const opensAt = speeds[0];
  const w16 = windowSpeed(20);
  const w33 = windowSpeed(35);
  const w60 = windowSpeed(60);
  let launch = "n/a (no drag samples — button ride?)";
  if (w60 !== null) {
    const reference = w16 ?? w33 ?? w60; // the last painted motion the eye saw
    const ratio = reference > 0.5 ? opensAt / reference : NaN;
    const verdict = Number.isNaN(ratio)
      ? ""
      : ratio < 0.7
        ? "   <<<<< BRAKES AT RELEASE"
        : ratio > 1.4
          ? "   <<<<< JUMPS AT RELEASE"
          : "   ok";
    const fmt = (v) => (v === null ? " -- " : v.toFixed(1).padStart(4));
    launch =
      `finger last20ms ${fmt(w16)} / 35ms ${fmt(w33)} / 60ms ${fmt(w60)} px/frame` +
      `  ->  ride opens at ${opensAt.toFixed(1)} (${(ratio * 100).toFixed(0)}% of last20ms)${verdict}`;
  }

  // Did the FINGER stop, or did the STRIP stop being painted while the finger
  // kept moving? Same window, both sources.
  const fingerWindow = (ms) => {
    const tail = (hunt.touch ?? []).filter(
      ([t]) => t <= ride.createdAt && t > ride.createdAt - ms,
    );
    if (tail.length < 2) return null;
    const [t0, x0] = tail[0];
    const [t1, x1] = tail[tail.length - 1];
    return (Math.abs(x1 - x0) / Math.max(1, t1 - t0)) * 16.7;
  };
  const lastTouchAt = (hunt.touch ?? [])
    .filter(([t]) => t <= ride.createdAt)
    .map(([t]) => t)
    .pop();
  const lastPaintAt = hunt.drag.filter(([t]) => t <= ride.createdAt).map(([t]) => t).pop();

  const span = Math.abs(ride.frames[ride.frames.length - 1] - ride.frames[0]);
  console.log(`--- ride #${i + 1}: ${span.toFixed(0)}px over ${ride.duration.toFixed(0)}ms ---`);
  const f20 = fingerWindow(20);
  const f60 = fingerWindow(60);
  const fmt = (v) => (v === null ? " -- " : v.toFixed(1).padStart(4));
  console.log(
    `    FINGER  last20ms ${fmt(f20)} / 60ms ${fmt(f60)} px/frame` +
      (lastTouchAt && lastPaintAt
        ? `   (last touch -> last paint: ${(lastPaintAt - lastTouchAt).toFixed(0)}ms)`
        : ""),
  );
  if (f20 !== null && w16 !== null) {
    const stalled = f20 > 3 && w16 < f20 * 0.5;
    if (stalled) {
      console.log(
        `    !!! STRIP STALLED while the finger was still moving (${f20.toFixed(1)} vs painted ${w16.toFixed(1)})`,
      );
    }
  }
  console.log(`    launch:   ${launch}`);
  console.log(`    px/frame: ${speeds.map((v) => v.toFixed(0).padStart(3)).join(" ")}`);

  // A dip: the strip slows down and then speeds up again. That is a stick, and
  // the frame counters are blind to it because every frame arrives on time.
  let dipAt = -1;
  for (let k = 1; k < speeds.length - 1; k += 1) {
    if (speeds[k] < speeds[k - 1] * 0.85 && speeds[k + 1] > speeds[k] * 1.15) {
      dipAt = k;
      break;
    }
  }
  const rising = speeds[0] < speeds[Math.min(6, speeds.length - 1)] * 0.7;
  if (dipAt >= 0) {
    console.log(
      `    !!! VELOCITY DIP at keyframe ${dipAt} (${((dipAt / speeds.length) * 100).toFixed(0)}% into the ride)`,
    );
  }
  if (rising) {
    console.log(
      `    !!! opens SLOW and accelerates — the strip crawls, then unsticks`,
    );
  }
}

page.close();
browser.close();
