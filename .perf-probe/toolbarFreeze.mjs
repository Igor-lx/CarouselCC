/**
 * The user reports the vertical-scroll-release freeze UNCHANGED after the
 * dvh->svh fix (which did reduce main-thread stall 33ms->17ms — real, but not
 * what the eye sees). So the visible freeze is NOT our relayout. Discriminate
 * what it is:
 *
 *   1. Inject an independent WAAPI dot (fixed-position, composited transform)
 *      — decoupled from the carousel, its gestures and its brakes.
 *   2. Sample the dot animation's currentTime in a rAF loop.
 *   3. Synthesize a vertical scroll; mark resize events.
 *   4. Repeat on a NEUTRAL page (example.com).
 *
 * Readouts per phase, in the ±500ms window around the toolbar settle:
 *   - max sampling gap (main-thread stall)
 *   - currentTime advance across each gap (did the ANIMATION CLOCK keep
 *     running while we could not sample, or did it freeze?)
 *
 * If the dot's clock stalls on BOTH pages -> Chrome's toolbar-settle behavior,
 * not our code. If only on ours -> something app-side still invalidates.
 *
 *   node .perf-probe/toolbarFreeze.mjs
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

const runPhase = async (label, url) => {
  await page.send("Page.navigate", { url });
  await new Promise((r) => setTimeout(r, 4500));

  await evaluate(`(() => {
    const w = window;
    // Tall page so there is something to scroll on example.com too.
    if (document.body.scrollHeight < window.innerHeight * 2) {
      const filler = document.createElement("div");
      filler.style.height = "300vh";
      document.body.appendChild(filler);
    }
    const dot = document.createElement("div");
    dot.style.cssText =
      "position:fixed;top:8px;left:8px;width:14px;height:14px;border-radius:50%;background:#e33;z-index:99999;will-change:transform;";
    document.body.appendChild(dot);
    const animation = dot.animate(
      [{ transform: "translateX(0px)" }, { transform: "translateX(220px)" }],
      { duration: 6000, easing: "linear", fill: "both" },
    );

    w.__tb = { samples: [], resizeAt: [] };
    const tick = () => {
      w.__tb.samples.push([performance.now(), Number(animation.currentTime)]);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const onResize = () => w.__tb.resizeAt.push(performance.now());
    window.addEventListener("resize", onResize);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", onResize);
    return true;
  })()`);

  await new Promise((r) => setTimeout(r, 400));
  const anchor = await evaluate(
    `({ x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight * 0.7) })`,
  );
  await page.send("Input.synthesizeScrollGesture", {
    x: anchor.x,
    y: anchor.y,
    yDistance: -240,
    speed: 1200,
  });
  await new Promise((r) => setTimeout(r, 1800));

  const out = await evaluate(`(() => {
    const { samples, resizeAt } = window.__tb;
    const lastResize = resizeAt[resizeAt.length - 1] ?? null;

    const gaps = [];
    for (let i = 1; i < samples.length; i += 1) {
      const dt = samples[i][0] - samples[i - 1][0];
      const dClock = samples[i][1] - samples[i - 1][1];
      gaps.push([samples[i][0], dt, dClock]);
    }
    const around = lastResize === null
      ? []
      : gaps.filter(([t]) => t >= lastResize - 500 && t <= lastResize + 500);
    const pick = (list) => {
      if (!list.length) return null;
      let worst = list[0];
      for (const g of list) if (g[1] > worst[1]) worst = g;
      return { stallMs: Math.round(worst[1]), clockAdvancedMs: Math.round(worst[2]) };
    };
    return {
      resizes: resizeAt.length,
      aroundSettle: pick(around),
      overall: pick(gaps),
    };
  })()`);

  const fmt = (g) =>
    g === null
      ? "(none)"
      : `stall ${g.stallMs}ms, clock advanced ${g.clockAdvancedMs}ms (${g.clockAdvancedMs >= g.stallMs - 5 ? "clock RAN" : "clock FROZE"})`;
  console.log(`  ${label.padEnd(24)} resizes ${out.resizes}   around settle: ${fmt(out.aroundSettle)}   worst overall: ${fmt(out.overall)}`);
};

console.log("Does the toolbar settle freeze an independent composited animation?\n");
await runPhase("CarouselCC (ours)", `https://igor-lx.github.io/CarouselCC/?probe=${Date.now()}`);
await runPhase("example.com (neutral)", "https://example.com/");
await runPhase("CarouselCC again", `https://igor-lx.github.io/CarouselCC/?probe=${Date.now()}`);
await runPhase("example.com again", "https://example.com/");

page.close();
