/**
 * Scenario B broke: the press brakes the ride (its animation dies unfinished)
 * but no settle ride follows. Find out what actually happens on the device:
 * which pointer events arrive, whether the long-press context menu fires and
 * steals the gesture, and what is written to the track after the touch.
 *
 *   node .perf-probe/catchHoldDebug.mjs
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

await page.send("Page.navigate", {
  url: `https://igor-lx.github.io/CarouselCC/?probe=${Date.now()}`,
});
await new Promise((r) => setTimeout(r, 5000));

const metrics = await evaluate(`(() => {
  window.scrollTo(0, 0);
  // The TRACK is translated by the ride (its rect can sit thousands of px
  // off-screen) — measure the static VIEWPORT the gesture listens on.
  const el = document.querySelector('[data-carousel-viewport]');
  const rect = el.getBoundingClientRect();
  return {
    x: Math.round(Math.min(Math.max(rect.x + rect.width / 2, 10), window.innerWidth - 10)),
    y: Math.round(Math.min(Math.max(rect.y + rect.height / 2, 10), window.innerHeight - 10)),
  };
})()`);

await evaluate(`(() => {
  const w = window;
  w.__dbg = { events: [], rides: 0, writes: [] };
  const t0 = performance.now();
  const log = (name) => w.__dbg.events.push([Math.round(performance.now() - t0), name]);

  for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "contextmenu", "touchstart", "touchend", "touchcancel", "lostpointercapture"]) {
    window.addEventListener(type, (e) => log(type + (e.type === "pointermove" ? "" : "")), { capture: true, passive: true });
  }

  const isTrack = (el) => /slideContainer/.test(String(el && el.className || ""));
  const origAnimate = Element.prototype.animate;
  Element.prototype.animate = function (k, o) {
    if (isTrack(this)) { w.__dbg.rides += 1; log("track.animate#" + w.__dbg.rides); }
    return origAnimate.call(this, k, o);
  };
  const styleDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "style");
  Object.defineProperty(HTMLElement.prototype, "style", {
    get() {
      const decl = styleDesc.get.call(this);
      if (!isTrack(this)) return decl;
      return new Proxy(decl, {
        set(target, prop, value) {
          if (prop === "transform") log("track.write " + String(value).slice(0, 40));
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
  return true;
})()`);

await evaluate(`document.querySelector('button[aria-label="Next slide"]').click(), true`);
await new Promise((r) => setTimeout(r, 350));
await page.send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [{ x: metrics.x, y: metrics.y }],
});
await new Promise((r) => setTimeout(r, 900));
await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await new Promise((r) => setTimeout(r, 2200));

const dbg = await evaluate(`JSON.stringify(window.__dbg.events)`);
for (const [t, name] of JSON.parse(dbg)) {
  console.log(`  ${String(t).padStart(5)}ms  ${name}`);
}

page.close();
