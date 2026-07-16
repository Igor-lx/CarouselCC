/**
 * THE PHYSICAL-PRESENT INSTRUMENT. The user's refined invariant: the artifact
 * fires when THE PAGE STOPS SCROLLING (== the lift for non-fling scrolls,
 * == fling end for sweeping ones). Produced frames are provably smooth, so
 * the stall must live in PRESENTATION. SurfaceFlinger --latency is gutted on
 * this ROM; Chrome's own PipelineReporter closes on the real presentation
 * feedback fence — its end-times ARE the physical present times.
 *
 * Capture: trace (benchmark, viz) + page touch/scrollend log, 20s armed.
 * Analysis: PRESENTED-frame present-time deltas; gaps >25ms, correlated with
 * scroll stops. The same trace carries viz's own mode/rate events if the
 * cause is a refresh-rate or BeginFrame-source flip.
 *
 *   node .perf-probe/scrollStopPresent.mjs
 */
import { writeFileSync } from "node:fs";

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
    for (const l of listeners) l(data);
  };
  return {
    send: (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      }),
    on: (l) => listeners.push(l),
    close: () => ws.close(),
  };
};

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const pageTarget = targets.find((t) => t.type === "page");
const version = await (await fetch("http://127.0.0.1:9222/json/version")).json();
const page = await connect(pageTarget.webSocketDebuggerUrl);
const browser = await connect(version.webSocketDebuggerUrl);

const evaluate = async (expression) => {
  const r = await Promise.race([
    page.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }),
    new Promise((_, rej) => setTimeout(() => rej(new Error("evaluate timeout")), 8000)),
  ]);
  return r?.result?.value;
};

await page.send("Page.navigate", {
  url: `https://igor-lx.github.io/CarouselCC/?probe=${Date.now()}`,
});
await new Promise((r) => setTimeout(r, 3000));
for (;;) {
  const ready = await evaluate(
    "Boolean(document.querySelector('[data-carousel-viewport]'))",
  ).catch(() => false);
  if (ready) break;
  await new Promise((r) => setTimeout(r, 800));
}

await evaluate(`(() => {
  window.__evt = [];
  window.__t0 = performance.now();
  const log = (name) => window.__evt.push([performance.now() - window.__t0, name]);
  window.addEventListener("touchstart", () => { window.__armed = true; log("touchDOWN"); }, { capture: true, passive: true });
  window.addEventListener("touchend", () => log("touchUP"), { capture: true, passive: true });
  let lastScroll = 0;
  window.addEventListener("scroll", () => {
    const now = performance.now();
    if (now - lastScroll > 200) log("scroll-active");
    lastScroll = now;
  }, { passive: true });
  if ("onscrollend" in window) {
    window.addEventListener("scrollend", () => log("SCROLLEND"), { passive: true });
  }
  document.documentElement.style.overscrollBehaviorY = "contain";
  document.body.style.overscrollBehaviorY = "contain";
  return true;
})()`);

console.log("");
console.log(">>> ВЗВЕДЕНО (20с с первого касания). Проезды едут сами.");
console.log(">>> Скролльте и ОСТАНАВЛИВАЙТЕ: и коротко с остановкой пальца,");
console.log(">>> и размашисто с флингом. Запоминайте, где видите отскок. <<<");
console.log("");

for (;;) {
  const armed = await evaluate("Boolean(window.__armed)").catch(() => false);
  if (armed) break;
  await new Promise((r) => setTimeout(r, 300));
}

// Clock anchor: a user_timing mark ties the page clock to the trace clock.
await browser.send("Tracing.start", {
  transferMode: "ReturnAsStream",
  traceConfig: {
    recordMode: "recordUntilFull",
    includedCategories: ["benchmark", "viz", "blink.user_timing", "toplevel.flow"],
  },
});
await evaluate(`(performance.clearMarks("present-anchor"), performance.mark("present-anchor"), window.__anchor = performance.now(), window.__t0 = window.__anchor, window.__evt.length = 0, true)`);
console.log(">>> касание — ПОШЛО (20с) <<<");

const rideTimer = setInterval(() => {
  evaluate(`document.querySelector('button[aria-label="Next slide"]').click(), true`).catch(() => {});
}, 2500);
evaluate(`document.querySelector('button[aria-label="Next slide"]').click(), true`).catch(() => {});

const drained = [];
const deadline = Date.now() + 20500;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 700));
  const chunk = await evaluate(
    "(() => { const c = window.__evt.splice(0); return JSON.stringify(c); })()",
  ).catch(() => null);
  if (chunk) drained.push(...JSON.parse(chunk));
}
clearInterval(rideTimer);

const streamPromise = new Promise((resolve) =>
  browser.on((m) => {
    if (m.method === "Tracing.tracingComplete") resolve(m.params.stream);
  }),
);
await browser.send("Tracing.end");
const stream = await streamPromise;
let raw = "";
for (;;) {
  const c = await browser.send("IO.read", { handle: stream });
  raw += c.base64Encoded ? Buffer.from(c.data, "base64").toString("utf8") : c.data;
  if (c.eof) break;
}
await browser.send("IO.close", { handle: stream });

writeFileSync(".perf-probe/out/present-events.json", JSON.stringify(drained));
writeFileSync(".perf-probe/out/present-trace.json", raw);
console.log(`events: ${drained.length}  trace: ${(raw.length / 1e6).toFixed(1)}MB saved`);
page.close();
browser.close();
