/**
 * The stop-teleport at vertical-scroll release is gone; a ~100ms micro-freeze
 * at the moment of finger-lift remains. Suspect: `min-height: 100dvh` on the
 * app shell — dvh re-resolves when the browser toolbar settles, which happens
 * exactly at finger-lift, forcing a full-page relayout mid-ride.
 *
 * A/B on the live deploy, scroll anchored OUTSIDE the strip (the new press
 * semantics intentionally brake the ride for on-strip touches):
 *   A) as shipped (dvh)
 *   B) min-height overridden to 100svh at runtime (svh is constant across
 *      toolbar transitions — no relayout at settle)
 *
 * Measured in the ±400ms window around the toolbar-settle resize:
 *   - main-thread stall: max rAF gap (page-side, no trace needed)
 *   - relayout evidence: resize events observed
 *
 *   node .perf-probe/scrollReleaseFreeze.mjs
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

const runPhase = async (label, useSvh) => {
  await page.send("Page.navigate", {
    url: `https://igor-lx.github.io/CarouselCC/?probe=${Date.now()}`,
  });
  await new Promise((r) => setTimeout(r, 5000));

  if (useSvh) {
    await evaluate(`(() => {
      const style = document.createElement("style");
      // Both shell containers use min-height: 100vh/100dvh; svh is stable
      // across toolbar transitions, so the settle stops re-resolving heights.
      style.textContent = '[class*="_app_"], [class*="_page_"] { min-height: 100svh !important; }';
      document.head.appendChild(style);
      return true;
    })()`);
  }

  const geometry = await evaluate(`(() => {
    window.scrollTo(0, 0);
    const el = document.querySelector('[class*="slideContainer"]');
    const rect = el.getBoundingClientRect();
    // BELOW the strip: on-strip touches now intentionally brake the ride.
    const y = Math.min(rect.bottom + 60, window.innerHeight - 16);
    return { x: Math.round(window.innerWidth / 2), y: Math.round(y), stripBottom: rect.bottom };
  })()`);

  await evaluate(`(() => {
    const w = window;
    w.__freeze = { gaps: [], resizeAt: [], last: 0 };
    const tick = (t) => {
      if (w.__freeze.last > 0) w.__freeze.gaps.push([t, t - w.__freeze.last]);
      w.__freeze.last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const onResize = () => w.__freeze.resizeAt.push(performance.now());
    window.addEventListener("resize", onResize);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", onResize);
    return true;
  })()`);

  // Ride + scroll mid-ride.
  await evaluate(`document.querySelector('button[aria-label="Next slide"]').click(), true`);
  await new Promise((r) => setTimeout(r, 350));
  await page.send("Input.synthesizeScrollGesture", {
    x: geometry.x,
    y: geometry.y,
    yDistance: -240,
    speed: 1200,
  });
  await new Promise((r) => setTimeout(r, 2200));

  const result = await evaluate(`(() => {
    const f = window.__freeze;
    const resizeAt = f.resizeAt[0] ?? null;
    let windowGaps = [];
    if (resizeAt !== null) {
      windowGaps = f.gaps
        .filter(([t]) => t >= resizeAt - 100 && t <= resizeAt + 400)
        .map(([, g]) => g);
    }
    const all = f.gaps.map(([, g]) => g);
    return {
      resizes: f.resizeAt.length,
      maxGapAroundResize: windowGaps.length ? Math.max(...windowGaps) : null,
      maxGapOverall: all.length ? Math.max(...all) : null,
    };
  })()`);

  // Restore scroll for the next phase.
  await page.send("Input.synthesizeScrollGesture", {
    x: geometry.x,
    y: geometry.y,
    yDistance: 240,
    speed: 1200,
  });
  await evaluate("window.scrollTo(0, 0), true");
  await new Promise((r) => setTimeout(r, 800));

  console.log(
    `  ${label.padEnd(26)} resize events ${String(result.resizes).padStart(2)}   ` +
      `max rAF gap around settle ${result.maxGapAroundResize === null ? "  (no resize seen)" : result.maxGapAroundResize.toFixed(0) + "ms"}` +
      `   max gap overall ${result.maxGapOverall?.toFixed(0)}ms`,
  );
  return result;
};

console.log("Micro-freeze at scroll release — is the dvh relayout the cause?\n");
await runPhase("A) as shipped (dvh)", false);
await runPhase("B) svh override", true);
await runPhase("A2) dvh again (repeat)", false);
await runPhase("B2) svh again (repeat)", true);

page.close();
