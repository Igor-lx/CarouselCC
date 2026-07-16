/**
 * TOUCH-BOOST THEORY: the freeze strikes at the exact finger LIFT, independent
 * of scroll length/speed/position/carousel state. Android's touch boost raises
 * CPU/GPU clocks while a finger is down and drops them at lift — on a weak
 * SoC the first post-drop frames can miss vsync: a 1-2 frame hitch exactly at
 * every lift. Explains why every SYNTHETIC test was clean (CDP input bypasses
 * the kernel -> no boost) and why frame counters saw nothing (frames are
 * merely 1 vsync late, not dropped in bulk).
 *
 * Two synchronized instruments:
 *   1. GPU clock sampled at ~20Hz over adb (kgsl gpuclk) — the boost drop is
 *      visible as a frequency cliff at each lift;
 *   2. screenrecord + the usual band analysis, hunting 1-2 frame production
 *      gaps (dt spikes with position catch-up) time-locked to lifts.
 *
 * Rides run on a TIMER (not on touches): the user only touches and lifts.
 *
 *   node .perf-probe/liftBoost.mjs
 */
import { spawn, execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";

const ADB = `${homedir()}/platform-tools/adb.exe`;

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const pageTarget = targets.find((t) => t.type === "page");
const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 1;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); }
};
const send = (method, params) =>
  new Promise((res) => { pending.set(id, res); ws.send(JSON.stringify({ id: id++, method, params })); });
const evaluate = async (expression) => {
  const r = await Promise.race([
    send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }),
    new Promise((_, rej) => setTimeout(() => rej(new Error("evaluate timeout")), 8000)),
  ]);
  return r?.result?.value;
};

await send("Page.navigate", {
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

const meta = await evaluate(`(() => {
  window.scrollTo(0, 0);
  const viewport = document.querySelector('[data-carousel-viewport]');
  const line = document.createElement("div");
  line.style.cssText =
    "position:absolute;top:45%;left:0;width:100%;height:6px;background:#f0f;z-index:9998;pointer-events:none;";
  viewport.appendChild(line);

  // Touch state, logged: down/up moments to correlate with the video and the
  // clock trace. Fixed indicator: cyan while a finger is down (video-visible).
  const dot = document.createElement("div");
  dot.style.cssText =
    "position:fixed;top:6px;left:6px;width:44px;height:44px;background:#000;z-index:9999;pointer-events:none;";
  document.body.appendChild(dot);
  window.__evt = [];
  window.__t0 = performance.now();
  const log = (name) => window.__evt.push([Math.round(performance.now() - window.__t0), name]);
  window.addEventListener("touchstart", () => { window.__armed = true; dot.style.background = "#0ff"; log("touchDOWN"); }, { capture: true, passive: true });
  window.addEventListener("touchend", () => { dot.style.background = "#000"; log("touchUP"); }, { capture: true, passive: true });
  window.addEventListener("touchcancel", () => { dot.style.background = "#000"; log("touchCANCEL"); }, { capture: true, passive: true });

  document.documentElement.style.overscrollBehaviorY = "contain";
  document.body.style.overscrollBehaviorY = "contain";

  return {
    dpr: window.devicePixelRatio,
    cssW: window.innerWidth,
    cssH: window.innerHeight,
    stripTopFromLine: 14,
  };
})()`);
if (!meta) throw new Error("meta failed");
writeFileSync(".perf-probe/out/freeze-meta.json", JSON.stringify(meta, null, 2));
console.log("meta:", JSON.stringify(meta));

console.log("");
console.log(">>> ВЗВЕДЕНО. Проезды поедут САМИ каждые 2.5с.");
console.log(">>> 25 секунд: сначала просто касайтесь/поднимайте палец БЕЗ скролла,");
console.log(">>> потом несколько раз ПОСКРОЛЛЬТЕ и отпустите. Запомните, где увидите отскок. <<<");
console.log("");

for (;;) {
  const armed = await evaluate("Boolean(window.__armed)").catch(() => false);
  if (armed) break;
  await new Promise((r) => setTimeout(r, 300));
}
await evaluate("window.__t0 = performance.now(), window.__evt.length = 0, true");
console.log(">>> касание — ПОШЛО (25с) <<<");

// GPU clock sampler: one adb shell, loop inside the device (fast, no per-call
// process spawn), ~25Hz, prints "ms clk" pairs.
const gpu = spawn(ADB, [
  "shell",
  "start=$(date +%s%3N); for i in $(seq 1 650); do now=$(date +%s%3N); clk=$(cat /sys/class/kgsl/kgsl-3d0/gpuclk 2>/dev/null || cat /sys/class/devfreq/*kgsl*/cur_freq 2>/dev/null || cat /sys/kernel/gpu/gpu_clock 2>/dev/null || echo 0); echo $((now-start)) $clk; sleep 0.04; done",
]);
let gpuLog = "";
gpu.stdout.on("data", (d) => { gpuLog += d.toString(); });

const rec = spawn(ADB, ["shell", "screenrecord", "--time-limit", "25", "/sdcard/freeze.mp4"]);

// Rides on a timer, decoupled from touches.
const rideTimer = setInterval(() => {
  evaluate(`document.querySelector('button[aria-label="Next slide"]').click(), true`).catch(() => {});
}, 2500);
evaluate(`document.querySelector('button[aria-label="Next slide"]').click(), true`).catch(() => {});

const drained = [];
const deadline = Date.now() + 25500;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 700));
  const chunk = await evaluate(
    "(() => { const c = window.__evt.splice(0); return JSON.stringify(c); })()",
  ).catch(() => null);
  if (chunk) drained.push(...JSON.parse(chunk));
}
clearInterval(rideTimer);

await Promise.race([
  new Promise((resolve) => rec.on("exit", resolve)),
  new Promise((r) => setTimeout(r, 6000)),
]);
gpu.kill();
writeFileSync(".perf-probe/out/lift-events.json", JSON.stringify(drained));
writeFileSync(".perf-probe/out/gpu-clock.txt", gpuLog);
execSync(`"${ADB}" pull /sdcard/freeze.mp4 .perf-probe/out/freeze.mp4`, {
  env: { ...process.env, MSYS_NO_PATHCONV: "1" },
});
console.log(`events: ${drained.length}  gpu samples: ${gpuLog.split("\n").length}  pulled`);
ws.close();
