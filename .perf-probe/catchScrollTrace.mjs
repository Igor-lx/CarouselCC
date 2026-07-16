/**
 * The ground-truth video shows: during a REAL on-strip vertical scroll the
 * ride freezes for the WHOLE scroll and relaunches from rest after the lift.
 * Signature of catch-brake + settle-on-release. Questions:
 *
 *   A) does the catch window let a PROMPTLY-moving scroll through (no brake)?
 *   B) when the finger RESTS >90ms then scrolls, when exactly does the engine
 *      hear about the verticality — at intent, or only at the lift?
 *
 * Synthesized touch sequences with controlled timing, full event log:
 *   1) touchStart -> immediate vertical moves -> end     (prompt scroll)
 *   2) touchStart -> rest 200ms -> vertical moves -> rest -> end (lazy scroll)
 *
 *   node .perf-probe/catchScrollTrace.mjs
 */
const connect = async (url) => {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let nextId = 1;
  const pending = new Map();
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
    }
  };
  return {
    send: (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      }),
    close: () => ws.close(),
  };
};

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const pageTarget = targets.find((t) => t.type === "page");
const page = await connect(pageTarget.webSocketDebuggerUrl);
const evaluate = async (expression) => {
  const r = await page.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ?? "eval failed");
  }
  return r.result.value;
};

const touch = (type, points) =>
  page.send("Input.dispatchTouchEvent", { type, touchPoints: points });

const runScenario = async (label, script) => {
  await page.send("Page.navigate", {
    url: `https://igor-lx.github.io/CarouselCC/?probe=${Date.now()}`,
  });
  await new Promise((r) => setTimeout(r, 4500));

  const anchor = await evaluate(`(() => {
    window.scrollTo(0, 0);
    const el = document.querySelector('[data-carousel-viewport]');
    const rect = el.getBoundingClientRect();
    return {
      x: Math.round(rect.x + rect.width / 2),
      y: Math.round(rect.y + rect.height / 2),
    };
  })()`);

  await evaluate(`(() => {
    const w = window;
    w.__log = [];
    const t0 = performance.now();
    const log = (name) => w.__log.push([Math.round(performance.now() - t0), name]);
    w.__mark = log;

    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "touchend", "touchcancel"]) {
      window.addEventListener(type, () => log(type), { capture: true, passive: true });
    }
    window.addEventListener("scroll", () => log("page.scroll"), { passive: true, once: true });

    const isTrack = (el) => /slideContainer/.test(String(el && el.className || ""));
    const origAnimate = Element.prototype.animate;
    Element.prototype.animate = function (k, o) {
      if (isTrack(this)) {
        const frames = Array.isArray(k) ? k : [];
        const last = frames[frames.length - 1];
        const m = last && /translate3d\\((-?[\\d.]+)px/.exec(String(last.transform));
        log("track.animate -> ends at " + (m ? m[1] + "px" : "?"));
      }
      return origAnimate.call(this, k, o);
    };
    const origCancel = Animation.prototype.cancel;
    Animation.prototype.cancel = function () {
      if (isTrack(this.effect && this.effect.target)) log("track.CANCEL(brake)");
      return origCancel.call(this);
    };
    return true;
  })()`);

  // Start a ride, then run the touch script mid-ride.
  await evaluate(`window.__mark("RIDE CLICK"), document.querySelector('button[aria-label="Next slide"]').click(), true`);
  await new Promise((r) => setTimeout(r, 300));
  await script(anchor);
  await new Promise((r) => setTimeout(r, 2500));

  const log = JSON.parse(await evaluate(`JSON.stringify(window.__log)`));
  console.log(`\n--- ${label} ---`);
  // Collapse pointermove runs.
  let moves = 0;
  for (const [t, name] of log) {
    if (name === "pointermove") { moves += 1; continue; }
    if (moves > 0) { console.log(`         (pointermove x${moves})`); moves = 0; }
    console.log(`  ${String(t).padStart(5)}ms  ${name}`);
  }
  if (moves > 0) console.log(`         (pointermove x${moves})`);
};

// Scenario 1: prompt vertical scroll (finger moves right away).
await runScenario("PROMPT scroll (moves start immediately)", async ({ x, y }) => {
  await touch("touchStart", [{ x, y }]);
  for (let i = 1; i <= 12; i += 1) {
    await touch("touchMove", [{ x, y: y - i * 14 }]);
    await new Promise((r) => setTimeout(r, 16));
  }
  await touch("touchEnd", []);
});

// Scenario 2: human-lazy scroll — rests 200ms: UNDER the 250ms window now.
await runScenario("LAZY-200 scroll (under the window: no brake)", async ({ x, y }) => {
  await touch("touchStart", [{ x, y }]);
  await new Promise((r) => setTimeout(r, 200));
  for (let i = 1; i <= 12; i += 1) {
    await touch("touchMove", [{ x, y: y - i * 14 }]);
    await new Promise((r) => setTimeout(r, 16));
  }
  await new Promise((r) => setTimeout(r, 400));
  await touch("touchEnd", []);
});

// Scenario 3: a genuinely resting finger (400ms) that then scrolls — the
// catch fires, and the vertical hand-off must RESUME the ride to its own
// destination (same end px as the first animation), not re-route it.
await runScenario("REST-400 then scroll (brake -> RESUME)", async ({ x, y }) => {
  await touch("touchStart", [{ x, y }]);
  await new Promise((r) => setTimeout(r, 400));
  for (let i = 1; i <= 12; i += 1) {
    await touch("touchMove", [{ x, y: y - i * 14 }]);
    await new Promise((r) => setTimeout(r, 16));
  }
  await new Promise((r) => setTimeout(r, 300));
  await touch("touchEnd", []);
});

page.close();
