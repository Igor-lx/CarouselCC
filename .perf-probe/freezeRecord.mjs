/**
 * GROUND-TRUTH capture of the vertical-scroll-release freeze. Every model-side
 * instrument (rAF gaps, animation clocks, frame reporters, a fixed-position
 * dot) says ~1-2 frames of hiccup; the user's eye says ~100ms, on-strip and
 * off-strip scrolls alike. So film the actual screen and measure the strip's
 * painted displacement frame by frame.
 *
 * In-content markers make the video self-describing:
 *   - a MAGENTA line pinned in the page flow just above the carousel: its
 *     screen-space Y anchors every frame (page scroll + toolbar shift), so the
 *     strip band is sampled content-relative;
 *   - a fixed corner box flashes WHITE for 250ms on every window/visualViewport
 *     resize — the toolbar-settle moments are labeled in the pixels themselves.
 *
 * Two rides in one take:
 *   ride 1 + scroll DOWN from page top   -> toolbar hides at lift (the repro);
 *   ride 2 + small scroll DOWN mid-page  -> toolbar already hidden: control.
 *
 *   node .perf-probe/freezeRecord.mjs
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
// Wait for the carousel to actually mount (slow network, screen wake, etc.).
// Wait as long as it takes: the phone screen may be asleep, and the probe
// must survive until the human wakes it and touches.
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
  if (window.innerWidth > window.innerHeight) return { landscape: true };

  const viewport = document.querySelector('[data-carousel-viewport]');
  const rect = viewport.getBoundingClientRect();

  // Content-anchored magenta line INSIDE the carousel container: it rides
  // with the carousel wherever the page scrolls, so the anchor never leaves
  // the frame while the strip is visible.
  const host = viewport.parentElement;
  host.style.position = host.style.position || "relative";
  const line = document.createElement("div");
  line.style.cssText =
    "position:absolute;top:4px;left:0;width:100%;height:6px;background:#f0f;z-index:9998;pointer-events:none;";
  viewport.appendChild(line);

  // Corner flash on every resize: the toolbar settle labels itself.
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

  // Arm on the first touch so the recording starts when the human is ready.
  window.__armed = false;
  const arm = () => { window.__armed = true; document.removeEventListener("touchstart", arm, true); };
  document.addEventListener("touchstart", arm, true);

  return {
    landscape: false,
    dpr: window.devicePixelRatio,
    cssW: window.innerWidth,
    cssH: window.innerHeight,
    stripTopFromLine: rect.height * 0.45, // sample band ~mid-strip, below the line
    stripBottom: rect.bottom,
  };
})()`);

if (meta.landscape) {
  console.log("PHONE IS IN LANDSCAPE — rotate to portrait and re-run.");
  process.exit(1);
}
writeFileSync(".perf-probe/out/freeze-meta.json", JSON.stringify(meta, null, 2));
console.log("meta:", JSON.stringify(meta));

// REAL-FINGER capture: synthesized gestures keep behaving differently from a
// finger (no toolbar motion, odd pointer stream). 18 seconds, the user drives.
console.log("");
console.log(">>> ВЗВЕДЕНО: запись начнётся с вашего ПЕРВОГО касания и идёт 16с.");
console.log(">>> Тапните Next, во время проезда вертикально скрольните и отпустите.");
console.log(">>> Повторите 2-3 раза, карусель держите на экране. <<<");
console.log("");
for (;;) {
  if (await evaluate("Boolean(window.__armed)")) break;
  await new Promise((r) => setTimeout(r, 300));
}
console.log(">>> касание — ЗАПИСЬ ПОШЛА (16с) <<<");
const rec = spawn(ADB, ["shell", "screenrecord", "--time-limit", "16", "/sdcard/freeze.mp4"]);
await new Promise((r) => setTimeout(r, 16500));

// Let screenrecord hit its own time limit, then pull.
await new Promise((resolve) => rec.on("exit", resolve));
execSync(`"${ADB}" pull /sdcard/freeze.mp4 .perf-probe/out/freeze.mp4`, {
  env: { ...process.env, MSYS_NO_PATHCONV: "1" },
});
console.log("pulled -> .perf-probe/out/freeze.mp4");
page.close();
