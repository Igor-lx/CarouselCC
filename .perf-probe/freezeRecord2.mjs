/**
 * Decisive capture: does an OUTSIDE vertical scroll's finger-lift stall a
 * mid-flight ride? Previous takes kept missing the overlap (rides ~1.7s ended
 * before the scroll). Fix: the probe CLICKS NEXT ITSELF the instant a touch
 * lands, so every user scroll rides on top of a freshly launched ride and the
 * lift lands mid-flight by construction. The user only scrolls.
 *
 * Markers as before: magenta content-anchor line inside the carousel,
 * corner flash on every window/visualViewport resize (toolbar settle).
 *
 *   node .perf-probe/freezeRecord2.mjs   (then analyze with freezeAnalyze.mjs)
 */
import { spawn, execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";

const ADB = `${homedir()}/platform-tools/adb.exe`;

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
await new Promise((r) => setTimeout(r, 3000));
for (;;) {
  const ready = await Promise.race([
    evaluate("Boolean(document.querySelector('[data-carousel-viewport]'))").catch(() => false),
    new Promise((r) => setTimeout(() => r(false), 4000)),
  ]);
  if (ready) break;
  await new Promise((r) => setTimeout(r, 800));
}

const meta = await evaluate(`(() => {
  window.scrollTo(0, 0);

  const viewport = document.querySelector('[data-carousel-viewport]');
  const rect = viewport.getBoundingClientRect();

  // The anchor line sits at the strip's VERTICAL MIDDLE: the user's real
  // flow shuttles the carousel in and out of the viewport, and a top-edge
  // line vanished first — blinding the tracker exactly around re-entry.
  const line = document.createElement("div");
  line.style.cssText =
    "position:absolute;top:45%;left:0;width:100%;height:6px;background:#f0f;z-index:9998;pointer-events:none;";
  viewport.appendChild(line);

  const flash = document.createElement("div");
  flash.style.cssText =
    "position:fixed;top:6px;left:6px;width:44px;height:44px;background:#000;z-index:9999;pointer-events:none;";
  document.body.appendChild(flash);
  let timer = null;
  const blip = () => {
    flash.style.background = "#fff";
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { flash.style.background = "#000"; }, 250);
  };
  window.addEventListener("resize", blip);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", blip);

  // Event log, aligned to the ARMED moment (recording start): lets the
  // analyzer tell a designed brake (finger down) from a spontaneous freeze.
  window.__evt = [];
  window.__evtT0 = 0;
  const logEvt = (name) =>
    window.__evt.push([Math.round(performance.now() - window.__evtT0), name]);
  for (const type of ["pointerdown", "pointerup", "pointercancel", "contextmenu"]) {
    window.addEventListener(type, () => logEvt(type), { capture: true, passive: true });
  }
  const isTrack = (el) => /slideContainer/.test(String((el && el.className) || ""));
  const origAnimate = Element.prototype.animate;
  Element.prototype.animate = function (k, o) {
    if (isTrack(this)) logEvt("track.animate");
    return origAnimate.call(this, k, o);
  };
  const origCancel = Animation.prototype.cancel;
  Animation.prototype.cancel = function () {
    if (isTrack(this.effect && this.effect.target)) logEvt("track.cancel");
    return origCancel.call(this);
  };

  // EVERY touch launches a ride (2.4s cooldown): the user's scroll then always
  // overlaps a mid-flight ride — the lift lands mid-ride by construction.
  window.__armed = false;
  let lastRide = 0;
  document.addEventListener(
    "touchstart",
    () => {
      if (!window.__armed) window.__evtT0 = performance.now();
      window.__armed = true;
      const now = performance.now();
      if (now - lastRide < 2400) return;
      lastRide = now;
      const next = document.querySelector('button[aria-label="Next slide"]');
      if (next) next.click();
    },
    { capture: true, passive: true },
  );

  return {
    dpr: window.devicePixelRatio,
    cssW: window.innerWidth,
    cssH: window.innerHeight,
    stripTopFromLine: 14, // band right under the mid-strip line
    stripBottom: rect.bottom,
  };
})()`);

writeFileSync(".perf-probe/out/freeze-meta.json", JSON.stringify(meta, null, 2));
console.log("meta:", JSON.stringify(meta));

console.log("");
console.log(">>> ВЗВЕДЕНО. Проезд запускается САМ при каждом касании.");
console.log(">>> Делайте РОВНО ВАШ обычный сценарий: мотайте вверх-вниз как всегда,");
console.log(">>> с уходом карусели за экран и возвратом — там, где фриз виден глазами. <<<");
console.log("");
for (;;) {
  const armed = await Promise.race([
    evaluate("Boolean(window.__armed)").catch(() => false),
    new Promise((r) => setTimeout(() => r(false), 4000)),
  ]);
  if (armed) break;
  await new Promise((r) => setTimeout(r, 300));
}
console.log(">>> касание — ЗАПИСЬ ПОШЛА (16с) <<<");
const rec = spawn(ADB, ["shell", "screenrecord", "--time-limit", "16", "/sdcard/freeze.mp4"]);
await new Promise((r) => setTimeout(r, 16500));

await new Promise((resolve) => rec.on("exit", resolve));
const events = await evaluate("JSON.stringify(window.__evt)");
writeFileSync(".perf-probe/out/freeze-events.json", events);
console.log("events captured:", JSON.parse(events).length);
execSync(`"${ADB}" pull /sdcard/freeze.mp4 .perf-probe/out/freeze.mp4`, {
  env: { ...process.env, MSYS_NO_PATHCONV: "1" },
});
console.log("pulled -> .perf-probe/out/freeze.mp4");
page.close();
