/**
 * THE decisive capture for the post-lift freeze. User's report: buttons and
 * scrolls happen entirely OUTSIDE the carousel, and ~0.5s AFTER the finger
 * lifts the strip visibly freezes once. 0.5s after lift = fling end + toolbar
 * settle + window.resize territory — none of which previous takes covered
 * (small scrolls never moved the toolbar; synthetic gestures don't either).
 *
 * One recording, two synchronized timelines:
 *   - VIDEO: strip displacement per frame (mid-strip magenta anchor line),
 *     corner flash marks every resize in the pixels themselves;
 *   - PAGE EVENT LOG: pointers, scroll/scrollend, window+visualViewport
 *     resizes, track animate/cancel (with end px), visibility — timestamped
 *     from the ARMED touch (= recording start).
 *
 * Hardened: overscroll containment (pull-to-refresh killed two takes),
 * automatic re-instrumentation if the page reloads anyway, guarded dumps.
 *
 *   node .perf-probe/freezeRecord3.mjs
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
  const r = await Promise.race([
    page.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("evaluate timeout (renderer busy/asleep?)")), 8000),
    ),
  ]);
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ?? "eval failed");
  }
  return r.result.value;
};
console.log("connected, navigating…");

// One self-contained instrumentation payload — safe to re-run after a reload.
// __hardT0 anchors all timestamps to the recording start (set once, survives
// re-instrumentation via a window global that reloads reset — the driver
// passes the elapsed offset back in on reinstall).
const INSTRUMENT = (offsetMs) => `(() => {
  if (window.__inst) return "already";
  window.__inst = true;
  const w = window;
  w.__evt = w.__evt || [];
  w.__t0 = performance.now() - ${offsetMs};
  const log = (name) => w.__evt.push([Math.round(performance.now() - w.__t0), name]);
  w.__log = log;
  log("INSTRUMENTED(offset=${offsetMs})");

  // Measurement-only: two takes died to pull-to-refresh.
  document.documentElement.style.overscrollBehaviorY = "contain";
  document.body.style.overscrollBehaviorY = "contain";

  // Markers.
  const viewport = document.querySelector('[data-carousel-viewport]');
  if (viewport) {
    const line = document.createElement("div");
    line.style.cssText =
      "position:absolute;top:45%;left:0;width:100%;height:6px;background:#f0f;z-index:9998;pointer-events:none;";
    viewport.appendChild(line);
  }
  const flash = document.createElement("div");
  flash.style.cssText =
    "position:fixed;top:6px;left:6px;width:44px;height:44px;background:#000;z-index:9999;pointer-events:none;";
  document.body.appendChild(flash);

  // BIG on-screen ride counter: the human can then say "the freeze was on
  // ride #N" and the timelines resolve it without guessing.
  const counter = document.createElement("div");
  counter.style.cssText =
    "position:fixed;top:4px;right:8px;font:bold 42px monospace;color:#ff2d78;z-index:9999;pointer-events:none;text-shadow:0 0 4px #000;";
  counter.textContent = "0";
  document.body.appendChild(counter);
  w.__rideNo = 0;
  let timer = null;
  const blip = () => {
    flash.style.background = "#fff";
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { flash.style.background = "#000"; }, 250);
  };

  // Events.
  for (const type of ["pointerdown", "pointerup", "pointercancel", "contextmenu"]) {
    window.addEventListener(type, () => log(type), { capture: true, passive: true });
  }
  window.addEventListener("resize", () => { log("window.resize"); blip(); });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => { log("vv.resize"); blip(); });
  }
  let lastScrollLog = 0;
  window.addEventListener("scroll", () => {
    const now = performance.now();
    if (now - lastScrollLog > 150) { lastScrollLog = now; log("scrolling…"); }
  }, { passive: true });
  if ("onscrollend" in window) {
    window.addEventListener("scrollend", () => log("SCROLLEND"), { passive: true });
  }
  document.addEventListener("visibilitychange", () => log("visibility=" + document.visibilityState));

  const isTrack = (el) => /slideContainer/.test(String((el && el.className) || ""));
  const origAnimate = Element.prototype.animate;
  Element.prototype.animate = function (k, o) {
    if (isTrack(this)) {
      const frames = Array.isArray(k) ? k : [];
      const last = frames[frames.length - 1];
      const m = last && /translate3d\\((-?[\\d.]+)px/.exec(String(last.transform));
      log("track.animate->" + (m ? m[1] : "?"));
    }
    return origAnimate.call(this, k, o);
  };
  const origCancel = Animation.prototype.cancel;
  Animation.prototype.cancel = function () {
    if (isTrack(this.effect && this.effect.target)) {
      const stack = String(new Error().stack || "").split("\\n")[2] || "";
      log("track.cancel @" + stack.trim().slice(0, 60));
    }
    return origCancel.call(this);
  };

  // Auto-ride on every touch (2.4s cooldown) + arming.
  w.__armed = w.__armed || false;
  let lastRide = 0;
  document.addEventListener(
    "touchstart",
    () => {
      w.__armed = true;
      const now = performance.now();
      if (now - lastRide < 2400) return;
      lastRide = now;
      const next = document.querySelector('button[aria-label="Next slide"]');
      if (next) {
        w.__rideNo += 1;
        counter.textContent = String(w.__rideNo);
        log("AUTO-RIDE #" + w.__rideNo);
        next.click();
      }
    },
    { capture: true, passive: true },
  );
  return "ok";
})()`;

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

let meta = null;
for (let i = 0; i < 10 && !meta; i += 1) {
  meta = await evaluate(`(() => {
    window.scrollTo(0, 0);
    return {
      dpr: window.devicePixelRatio,
      cssW: window.innerWidth,
      cssH: window.innerHeight,
      stripTopFromLine: 14,
    };
  })()`).catch(() => null);
  if (!meta) await new Promise((r) => setTimeout(r, 1000));
}
if (!meta) throw new Error("page never responded — is the screen awake?");
writeFileSync(".perf-probe/out/freeze-meta.json", JSON.stringify(meta, null, 2));
await evaluate(INSTRUMENT(0));

console.log("meta:", JSON.stringify(meta));
console.log("");
console.log(">>> ВЗВЕДЕНО. Проезды запускаются сами при каждом касании.");
console.log(">>> Ваш обычный сценарий, палец ВНЕ карусели, скроллы РАЗМАШИСТЫЕ —");
console.log(">>> так, чтобы адресная строка браузера пряталась и возвращалась. <<<");
console.log("");

let armedAtWall = null;
for (;;) {
  const armed = await Promise.race([
    evaluate("Boolean(window.__armed)").catch(() => false),
    new Promise((r) => setTimeout(() => r(false), 4000)),
  ]);
  if (armed) { armedAtWall = Date.now(); break; }
  await new Promise((r) => setTimeout(r, 300));
}
console.log(">>> касание — ЗАПИСЬ ПОШЛА (16с) <<<");
const rec = spawn(ADB, ["shell", "screenrecord", "--time-limit", "16", "/sdcard/freeze.mp4"]);

// Babysit the take: if the page reloads, re-instrument with the elapsed offset
// so timestamps stay on the recording clock. Drain events as we go.
const drained = [];
const deadline = Date.now() + 16500;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 700));
  const chunk = await evaluate(
    `(() => { if (!window.__evt) return null; const c = window.__evt.splice(0); return JSON.stringify(c); })()`,
  ).catch(() => null);
  if (chunk === null) {
    const offset = Date.now() - armedAtWall;
    console.log(`    (page context lost — re-instrumenting at +${offset}ms)`);
    drained.push([offset, "PAGE RELOADED"]);
    await evaluate(INSTRUMENT(offset)).catch(() => {});
    continue;
  }
  drained.push(...JSON.parse(chunk));
}

await new Promise((resolve) => rec.on("exit", resolve));
writeFileSync(".perf-probe/out/freeze-events.json", JSON.stringify(drained));
execSync(`"${ADB}" pull /sdcard/freeze.mp4 .perf-probe/out/freeze.mp4`, {
  env: { ...process.env, MSYS_NO_PATHCONV: "1" },
});
console.log(`events: ${drained.length}   pulled -> .perf-probe/out/freeze.mp4`);
page.close();
