/**
 * ON-DEVICE frame-by-frame MOTION probe (adb-forwarded CDP :9222).
 *
 *   node .perf-probe/deviceMotion.mjs
 *
 * Not an FPS counter: every rAF it samples the TRACK's computed transform-x,
 * so the analysis judges what the frames actually SHOW — forward motion,
 * a stall (zero deltas then a catch-up jump), or a bounce (direction flip).
 * Arms on the first real touch, records 15s, logs touches on the same clock.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const RECORD_MS = 15000;
const OUT = ".perf-probe/out/device-motion.json";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().includes("CarouselCC"));
if (!page) throw new Error("CarouselCC page not found on device");

await page.bringToFront();
await page.waitForTimeout(500);

await page.evaluate(() => {
  const w = window;
  const track = document.querySelector("[data-carousel-track]");
  const readX = () => {
    const t = getComputedStyle(track).transform;
    if (!t || t === "none") return 0;
    const m = t.match(/matrix(?:3d)?\(([^)]+)\)/);
    if (!m) return 0;
    const p = m[1].split(",").map(Number);
    return p.length === 16 ? p[12] : p[4];
  };
  w.__mot = { pos: [], touch: [], go: false };
  const tick = () => {
    w.__mot.pos.push([performance.now(), readX()]);
    w.__mot.raf = requestAnimationFrame(tick);
  };
  window.addEventListener(
    "touchstart",
    () => {
      if (w.__mot.go) return;
      w.__mot.go = true;
      w.__mot.raf = requestAnimationFrame(tick);
    },
    { capture: true },
  );
  window.addEventListener(
    "touchstart",
    (e) => w.__mot.go && w.__mot.touch.push(["start", performance.now(), e.touches[0]?.clientX]),
    { capture: true },
  );
  window.addEventListener(
    "touchend",
    (e) => w.__mot.go && w.__mot.touch.push(["end", performance.now(), e.changedTouches[0]?.clientX]),
    { capture: true },
  );
});

console.log(">>> ARMED: waiting for the first touch (no time limit)... <<<");
await page.waitForFunction("window.__mot.go === true", null, { timeout: 0 });
console.log(`>>> touch detected — recording ${RECORD_MS / 1000}s <<<`);
await page.waitForTimeout(RECORD_MS);

const data = await page.evaluate(() => {
  cancelAnimationFrame(window.__mot.raf);
  return { pos: window.__mot.pos, touch: window.__mot.touch };
});
await browser.close();
writeFileSync(OUT, JSON.stringify(data));

// ---- analysis ---------------------------------------------------------------
const { pos, touch } = data;
if (pos.length < 10) throw new Error("no position samples — track logger failed");
const t0 = pos[0][0];
const rel = (t) => Math.round(t - t0);

console.log(`\nsamples=${pos.length} over ${rel(pos[pos.length - 1][0])}ms`);
console.log(
  "touches:",
  touch.map(([k, t]) => `${k}@+${rel(t)}`).join("  "),
);

// rAF continuity: gaps mean NOTHING was sampled — the loop itself starved.
let worstDt = 0;
for (let i = 1; i < pos.length; i += 1)
  worstDt = Math.max(worstDt, pos[i][0] - pos[i - 1][0]);
console.log(`rAF continuity: worst inter-sample dt=${Math.round(worstDt)}ms`);

const ends = touch.filter(([k]) => k === "end").map(([, t]) => t);
const starts = touch.filter(([k]) => k === "start").map(([, t]) => t);

const EPS_STILL = 0.05; // px per frame counted as "no movement"
const JUMP_PX = 2; // catch-up jump after stillness that the eye would see

for (const e of ends) {
  const nextStart = starts.find((s) => s > e + 50) ?? e + 2000;
  const win = pos.filter(([t]) => t >= e && t <= Math.min(e + 2000, nextStart));
  if (win.length < 5) continue;

  const xs = win.map(([, x]) => x);
  const total = xs[xs.length - 1] - xs[0];
  const dir = Math.sign(total);
  if (Math.abs(total) < 1) {
    console.log(`\nrel+${rel(e)}: deck did not move (net ${total.toFixed(2)}px)`);
    continue;
  }

  // final plateau: ride considered over once within 0.5px of the final value
  const finalX = xs[xs.length - 1];
  let rideEndIdx = xs.length - 1;
  while (rideEndIdx > 0 && Math.abs(xs[rideEndIdx - 1] - finalX) < 0.5) rideEndIdx -= 1;

  const stalls = [];
  const reversals = [];
  let stillRun = 0;
  let maxDx = 0;
  for (let i = 1; i <= rideEndIdx; i += 1) {
    const dx = xs[i] - xs[i - 1];
    maxDx = Math.max(maxDx, Math.abs(dx));
    if (Math.abs(dx) < EPS_STILL) {
      stillRun += 1;
    } else {
      if (stillRun >= 3 && Math.abs(dx) > JUMP_PX) {
        stalls.push(
          `+${rel(win[i - stillRun - 1][0]) - rel(e)}ms: froze ${stillRun}fr (~${Math.round(
            win[i][0] - win[i - stillRun - 1][0],
          )}ms) then jumped ${dx.toFixed(1)}px`,
        );
      }
      if (dir !== 0 && Math.sign(dx) === -dir && Math.abs(dx) > 0.5) {
        reversals.push(`+${rel(win[i][0]) - rel(e)}ms: bounced ${dx.toFixed(1)}px`);
      }
      stillRun = 0;
    }
  }

  const rideMs = Math.round(win[rideEndIdx][0] - e);
  console.log(
    `\nrel+${rel(e)}: ride ${Math.abs(total).toFixed(0)}px in ${rideMs}ms, peak ${maxDx.toFixed(1)}px/fr`,
  );
  console.log(`  stalls-then-jump: ${stalls.length ? stalls.join("; ") : "NONE"}`);
  console.log(`  bounces:          ${reversals.length ? reversals.join("; ") : "NONE"}`);

  // STRICT per-frame uniformity audit over the ride (recenter frames and the
  // sub-px landing tail excluded):
  //  - late frame: dt > 1.5x the median vsync (the previous image was HELD —
  //    the eye sees a micro-stick even if the position then lands correctly);
  //  - dip/catch-up: single-frame |dx| dropping >35% below the neighbour
  //    average (a stick) or exceeding it by >60% (the catch-up jerk);
  //  - backward/zero motion before the landing tail.
  const dts = [];
  for (let i = 1; i <= rideEndIdx; i += 1) dts.push(win[i][0] - win[i - 1][0]);
  const medDt = [...dts].sort((a, b) => a - b)[Math.floor(dts.length / 2)] || 16.7;
  const anomalies = [];
  for (let i = 1; i <= rideEndIdx; i += 1) {
    const at = Math.round(win[i][0] - e);
    const dt = win[i][0] - win[i - 1][0];
    const dx = xs[i] - xs[i - 1];
    if (Math.abs(dx) > 100) continue; // recenter reset, audited separately
    if (dt > medDt * 1.5) anomalies.push(`+${at}ms LATE frame (dt=${Math.round(dt)}ms, dx=${dx.toFixed(1)})`);
    if (i >= 2 && i < rideEndIdx) {
      const prev = Math.abs(xs[i - 1] - xs[i - 2]);
      const next = Math.abs(xs[i + 1] - xs[i]);
      const nb = (prev + next) / 2;
      if (nb > 1) {
        const cur = Math.abs(dx);
        if (cur < nb * 0.65) anomalies.push(`+${at}ms DIP ${cur.toFixed(1)}px vs ~${nb.toFixed(1)} neighbours`);
        else if (cur > nb * 1.6) anomalies.push(`+${at}ms SPIKE ${cur.toFixed(1)}px vs ~${nb.toFixed(1)} neighbours`);
      }
    }
    if (dir !== 0 && Math.sign(dx) === -dir && Math.abs(dx) > 0.3 && Math.abs(dx) < 100)
      anomalies.push(`+${at}ms BACKWARD ${dx.toFixed(1)}px`);
  }
  console.log(`  uniformity audit (median dt=${medDt.toFixed(1)}ms): ${anomalies.length ? "" : "CLEAN"}`);
  for (const a of anomalies) console.log(`    ${a}`);

  // full px/frame tape, 20 buckets — the shape the eye rode through
  const bucket = Math.max(1, Math.floor(rideEndIdx / 20));
  const profile = [];
  for (let b = 0; b < rideEndIdx; b += bucket) {
    let sum = 0;
    let n = 0;
    for (let i = b + 1; i <= Math.min(b + bucket, rideEndIdx); i += 1) {
      const d = Math.abs(xs[i] - xs[i - 1]);
      if (d < 100) {
        sum += d;
        n += 1;
      }
    }
    profile.push((sum / Math.max(1, n)).toFixed(1));
  }
  console.log(`  px/frame profile: ${profile.join(" ")}`);
}
