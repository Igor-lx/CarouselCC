/**
 * Device verification for the two ride-interruption fixes, on the LIVE deploy:
 *
 *   A) vertical page scroll DURING a ride (synthesized flick, toolbar settles
 *      on release) — the ride must survive: no animation cancel, no freeze, no
 *      teleport at settle.
 *   B) a finger merely LANDING on the strip mid-ride (touch down, hold, up,
 *      zero movement) — the ride must not be grabbed: no cancel, no freeze.
 *
 * Signatures watched, all write-side (no computed-style reads):
 *   - Animation.prototype.cancel on the track  -> the old freeze
 *   - track style.transform writes during the ride -> a grab's follow writes
 *   - the ride's end position vs its keyframes' end -> teleport vs completion
 *
 *   node .perf-probe/rideInterruption.mjs
 */
const RIDE_MS = 2400;

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
if (!pageTarget) throw new Error("no page target");
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
  const el = document.querySelector('[class*="slideContainer"]');
  const rect = el.getBoundingClientRect();
  // CDP Input takes visual-viewport CSS px — clamp inside it, or the gesture
  // is rejected with "Position out of bounds".
  const x = Math.min(Math.max(rect.x + rect.width / 2, 10), window.innerWidth - 10);
  const y = Math.min(Math.max(rect.y + rect.height / 2, 10), window.innerHeight - 10);
  return { x, y };
})()`);

await evaluate(`(() => {
  const w = window;
  w.__ride = { cancels: 0, followWrites: 0, rides: [] };
  const isTrack = (el) => /slideContainer/.test(String(el && el.className || ""));
  const pxOf = (t) => {
    const m = /translate3d\\((-?[\\d.]+)px/.exec(String(t));
    return m ? parseFloat(m[1]) : null;
  };

  const origCancel = Animation.prototype.cancel;
  Animation.prototype.cancel = function () {
    if (isTrack(this.effect && this.effect.target)) w.__ride.cancels += 1;
    return origCancel.call(this);
  };

  const styleDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "style");
  Object.defineProperty(HTMLElement.prototype, "style", {
    get() {
      const decl = styleDesc.get.call(this);
      if (!isTrack(this)) return decl;
      return new Proxy(decl, {
        set(target, prop, value) {
          if (prop === "transform") w.__ride.followWrites += 1;
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

  const origAnimate = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    const animation = origAnimate.call(this, keyframes, options);
    if (isTrack(this)) {
      const frames = (Array.isArray(keyframes) ? keyframes : []).map((f) => pxOf(f.transform));
      w.__ride.rides.push({ end: frames[frames.length - 1], animation });
      animation.finished.then(
        () => { w.__ride.rides[w.__ride.rides.length - 1].finished = true; },
        () => {},
      );
    }
    return animation;
  };
  return true;
})()`);

const startRide = async () => {
  await evaluate(`(() => {
    window.__ride.cancels = 0;
    window.__ride.followWrites = 0;
    document.querySelector('button[aria-label="Next slide"]').click();
    return true;
  })()`);
};

const report = async (label) => {
  const r = await evaluate(`(() => {
    const s = window.__ride;
    const last = s.rides[s.rides.length - 1] || {};
    return {
      cancels: s.cancels,
      followWrites: s.followWrites,
      finished: Boolean(last.finished),
    };
  })()`);
  // A HEALTHY completion also cancels: the app's own onfinish pins the final
  // transform and cancels the spent animation. The discriminator is
  // `finished`: an interrupted ride never resolves its finished promise.
  const verdict = r.finished ? "RIDE SURVIVED ✅" : "RIDE INTERRUPTED ❌";
  console.log(
    `  ${label.padEnd(44)} cancels ${r.cancels}  followWrites ${r.followWrites}  finished ${r.finished}   ${verdict}`,
  );
  return r;
};

console.log("A) vertical scroll flick mid-ride (anchored on the carousel)");
await startRide();
await new Promise((r) => setTimeout(r, 400));
await page.send("Input.synthesizeScrollGesture", {
  x: Math.round(metrics.x),
  y: Math.round(metrics.y),
  yDistance: -260,
  speed: 1400,
});
await new Promise((r) => setTimeout(r, RIDE_MS));
await report("scroll on the strip during the ride");

// Scroll back up so the strip is in view again.
await page.send("Input.synthesizeScrollGesture", {
  x: Math.round(metrics.x),
  y: Math.round(metrics.y),
  yDistance: 260,
  speed: 1400,
});
await evaluate("window.scrollTo(0, 0), true");
await new Promise((r) => setTimeout(r, 1200));

console.log("\nB) finger lands mid-ride, holds still 900ms, lifts (no movement)");
await startRide();
await new Promise((r) => setTimeout(r, 350));
await page.send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [{ x: Math.round(metrics.x), y: Math.round(metrics.y) }],
});
await new Promise((r) => setTimeout(r, 900));
await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await new Promise((r) => setTimeout(r, RIDE_MS));
await report("press-and-hold on the strip during the ride");

page.close();
