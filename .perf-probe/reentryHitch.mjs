/**
 * Hypothesis: the surviving "freeze ~0.5s after lift" is the RE-ENTRY of the
 * animating track layer into the viewport. The user's real flow runs rides
 * off-screen (external buttons + big scrolls); the merged timeline shows every
 * VISIBLE ride crossing scrolls/resizes/scrollend with zero stall, while
 * off-screen rides only ever meet the eye at re-entry — where a culled layer
 * must re-raster while moving.
 *
 * Synthetic, no human: scroll the carousel out, start a ride, scroll back in
 * mid-ride, film it. Repeat. Measure the strip's dx in the first frames after
 * re-entry.
 *
 *   node .perf-probe/reentryHitch.mjs
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
  const rect = viewport.getBoundingClientRect();
  const line = document.createElement("div");
  line.style.cssText =
    "position:absolute;top:45%;left:0;width:100%;height:6px;background:#f0f;z-index:9998;pointer-events:none;";
  viewport.appendChild(line);
  return {
    dpr: window.devicePixelRatio,
    cssW: window.innerWidth,
    cssH: window.innerHeight,
    stripTopFromLine: 14,
    offY: Math.round(rect.bottom + window.scrollY + 40), // fully below the carousel
  };
})()`);
if (!meta) throw new Error("meta failed — page not ready");
writeFileSync(".perf-probe/out/freeze-meta.json", JSON.stringify(meta, null, 2));
console.log("meta:", JSON.stringify(meta));

console.log("recording 16s: 3x (scroll out -> ride -> scroll back mid-ride)…");
const rec = spawn(ADB, ["shell", "screenrecord", "--time-limit", "16", "/sdcard/freeze.mp4"]);
await new Promise((r) => setTimeout(r, 1200));

for (let i = 0; i < 3; i += 1) {
  // 1. Carousel fully off-screen.
  await evaluate(`window.scrollTo({ top: ${meta.offY}, behavior: "instant" }), true`);
  await new Promise((r) => setTimeout(r, 600));
  // 2. Ride starts off-screen.
  await evaluate(`document.querySelector('button[aria-label="Next slide"]').click(), true`);
  await new Promise((r) => setTimeout(r, 500));
  // 3. Mid-ride, bring it back — smooth, like a fling carrying it in.
  await evaluate(`window.scrollTo({ top: 0, behavior: "smooth" }), true`);
  await new Promise((r) => setTimeout(r, 3600));
}

await Promise.race([
  new Promise((resolve) => rec.on("exit", resolve)),
  new Promise((r) => setTimeout(r, 18000)),
]);
execSync(`"${ADB}" pull /sdcard/freeze.mp4 .perf-probe/out/freeze.mp4`, {
  env: { ...process.env, MSYS_NO_PATHCONV: "1" },
});
console.log("pulled -> .perf-probe/out/freeze.mp4");
ws.close();
