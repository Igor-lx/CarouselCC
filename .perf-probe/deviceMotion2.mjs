/**
 * ON-DEVICE recenter-atomicity probe (adb-forwarded CDP :9222).
 *
 *   node .perf-probe/deviceMotion2.mjs
 *
 * Every rAF logs the track transform-x AND the SCREEN-space x of the slide
 * under the viewport centre (plus its identity). The virtualization recenter
 * resets the transform by one slot after settle; if that reset is not
 * pixel-atomic with the slide re-indexing, the centre slide's screen x will
 * show a one-frame spike — the visible "дёрг". Arms on first touch, 15s.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const RECORD_MS = 15000;
const OUT = ".perf-probe/out/device-motion2.json";

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
  const viewport = document.querySelector("[data-carousel-viewport]");
  const vr = viewport.getBoundingClientRect();
  const cx = vr.x + vr.width / 2;
  const cy = vr.y + vr.height / 2;
  const readTrackX = () => {
    const t = getComputedStyle(track).transform;
    const m = t && t !== "none" ? t.match(/matrix(?:3d)?\(([^)]+)\)/) : null;
    if (!m) return 0;
    const p = m[1].split(",").map(Number);
    return p.length === 16 ? p[12] : p[4];
  };
  const readCenter = () => {
    const el = document.elementFromPoint(cx, cy);
    const item = el?.closest("[data-carousel-track] > *");
    if (!item) return [null, null];
    const key = item.querySelector("img")?.src ?? item.textContent?.slice(0, 20) ?? "?";
    return [item.getBoundingClientRect().x, key];
  };
  w.__mot2 = { rows: [], touch: [], go: false };
  const tick = () => {
    const [sx, key] = readCenter();
    w.__mot2.rows.push([performance.now(), readTrackX(), sx, key]);
    w.__mot2.raf = requestAnimationFrame(tick);
  };
  window.addEventListener(
    "touchstart",
    () => {
      if (w.__mot2.go) return;
      w.__mot2.go = true;
      w.__mot2.raf = requestAnimationFrame(tick);
    },
    { capture: true },
  );
  window.addEventListener(
    "touchstart",
    () => w.__mot2.go && w.__mot2.touch.push(["start", performance.now()]),
    { capture: true },
  );
  window.addEventListener(
    "touchend",
    () => w.__mot2.go && w.__mot2.touch.push(["end", performance.now()]),
    { capture: true },
  );
});

console.log(">>> ARMED: waiting for the first touch (no time limit)... <<<");
await page.waitForFunction("window.__mot2.go === true", null, { timeout: 0 });
console.log(`>>> touch detected — recording ${RECORD_MS / 1000}s <<<`);
await page.waitForTimeout(RECORD_MS);

const data = await page.evaluate(() => {
  cancelAnimationFrame(window.__mot2.raf);
  return { rows: window.__mot2.rows, touch: window.__mot2.touch };
});
await browser.close();
writeFileSync(OUT, JSON.stringify(data));

// ---- analysis ---------------------------------------------------------------
const { rows, touch } = data;
if (rows.length < 10) throw new Error("no samples");
const t0 = rows[0][0];
const rel = (t) => Math.round(t - t0);

console.log(`\nsamples=${rows.length}`);
console.log("touches:", touch.map(([k, t]) => `${k}@+${rel(t)}`).join("  "));

// 1) Track-transform resets (the recenter): |d(trackX)| > 100px in one frame.
// 2) For each reset, what did the EYE see: d(center-slide screen x) that frame.
console.log("\ntrack resets and what the eye saw at each:");
let found = 0;
for (let i = 1; i < rows.length; i += 1) {
  const [t, x, sx, key] = rows[i];
  const [, px, psx, pkey] = rows[i - 1];
  const dTrack = x - px;
  if (Math.abs(dTrack) > 100) {
    found += 1;
    const eye =
      sx !== null && psx !== null
        ? `${(sx - psx).toFixed(1)}px${key === pkey ? " (same slide)" : ` (slide changed: …${String(pkey).slice(-12)} -> …${String(key).slice(-12)})`}`
        : "n/a";
    console.log(
      `  +${rel(t)}ms: track jumped ${dTrack.toFixed(0)}px | centre slide moved on screen: ${eye}`,
    );
  }
}
if (!found) console.log("  none in this capture");

// 3) Any OTHER single-frame screen jump of the centre slide (same slide,
// no recenter) — a real visible hitch during rides.
console.log("\nvisible centre-slide jumps >12px in one frame (outside resets):");
let hits = 0;
for (let i = 1; i < rows.length; i += 1) {
  const [t, x, sx, key] = rows[i];
  const [, px, psx, pkey] = rows[i - 1];
  if (sx === null || psx === null || key !== pkey) continue;
  if (Math.abs(x - px) > 100) continue; // recenter frame, reported above
  const d = sx - psx;
  if (Math.abs(d) > 12) {
    hits += 1;
    if (hits <= 20) console.log(`  +${rel(t)}ms: ${d.toFixed(1)}px`);
  }
}
if (!hits) console.log("  none — screen-space motion is continuous");
