/**
 * Scenario A regressed on the new deploy: a vertical scroll OUTSIDE the strip
 * kills the ride. Or does it? Earlier probe touches at x=10 may have
 * pinch-zoomed the page (innerHeight read 255 CSS px). Run A fresh and log:
 *   - viewport sanity (innerHeight, visualViewport.scale)
 *   - every track Animation.cancel WITH the caller's stack
 *   - resize events
 *
 *   node .perf-probe/scrollKillDebug.mjs
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

// Reset any pinch zoom left by earlier broken probes.
try {
  await page.send("Emulation.resetPageScaleFactor");
} catch {
  /* not supported — the fresh navigation usually resets it anyway */
}

await page.send("Page.navigate", {
  url: `https://igor-lx.github.io/CarouselCC/?probe=${Date.now()}`,
});
await new Promise((r) => setTimeout(r, 5000));

const sanity = await evaluate(`(() => ({
  innerH: window.innerHeight,
  innerW: window.innerWidth,
  scale: window.visualViewport ? window.visualViewport.scale : null,
}))()`);
console.log("viewport:", JSON.stringify(sanity));

const geometry = await evaluate(`(() => {
  window.scrollTo(0, 0);
  const el = document.querySelector('[data-carousel-viewport]');
  const rect = el.getBoundingClientRect();
  return {
    x: Math.round(window.innerWidth / 2),
    yOutside: Math.round(Math.min(rect.bottom + 80, window.innerHeight - 20)),
    stripBottom: Math.round(rect.bottom),
  };
})()`);
console.log("scroll anchor:", JSON.stringify(geometry));

await evaluate(`(() => {
  const w = window;
  w.__kill = { events: [] };
  const t0 = performance.now();
  const log = (name) => w.__kill.events.push([Math.round(performance.now() - t0), name]);

  const isTrack = (el) => /slideContainer/.test(String(el && el.className || ""));
  const origAnimate = Element.prototype.animate;
  Element.prototype.animate = function (k, o) {
    if (isTrack(this)) log("track.animate");
    return origAnimate.call(this, k, o);
  };
  const origCancel = Animation.prototype.cancel;
  Animation.prototype.cancel = function () {
    if (isTrack(this.effect && this.effect.target)) {
      const stack = String(new Error().stack || "")
        .split("\\n")
        .slice(2, 5)
        .map((l) => l.trim())
        .join(" <- ");
      log("track.CANCEL: " + stack.slice(0, 180));
    }
    return origCancel.call(this);
  };
  window.addEventListener("resize", () => log("window.resize"));
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => log("vv.resize"));
  }
  for (const type of ["pointerdown", "pointercancel", "pointerup"]) {
    window.addEventListener(type, (e) => log(type + " @" + Math.round(e.clientX) + "," + Math.round(e.clientY)), { capture: true, passive: true });
  }
  return true;
})()`);

await evaluate(`document.querySelector('button[aria-label="Next slide"]').click(), true`);
await new Promise((r) => setTimeout(r, 400));
await page.send("Input.synthesizeScrollGesture", {
  x: geometry.x,
  y: geometry.yOutside,
  yDistance: -240,
  speed: 1200,
});
await new Promise((r) => setTimeout(r, 2400));

const events = JSON.parse(await evaluate(`JSON.stringify(window.__kill.events)`));
for (const [t, name] of events) console.log(`  ${String(t).padStart(5)}ms  ${name}`);

page.close();
