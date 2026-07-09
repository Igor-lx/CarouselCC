/**
 * Engine-rework verification probe (touch emulation).
 *
 * Records, per rAF: track translateX + track WAAPI animation count, and the
 * pagination widget's center dot translateX + its WAAPI animation count.
 * Drives single + repeated clicks. Verifies:
 *  - the track runs on WAAPI (anims > 0 during motion) with a smooth profile;
 *  - the widget runs on WAAPI too (dot anims > 0 during motion, no JS writes);
 *  - widget and track start/stop together (time correlation).
 */
import { chromium } from "playwright-core";

const URL = "http://localhost:4173/CarouselCC/";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 420, height: 800 },
  hasTouch: true,
  isMobile: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36",
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForSelector("[data-carousel-track]");
await page.waitForTimeout(2500);

const widgetInfo = await page.evaluate(() => {
  const bound = document.querySelector('[data-motion-bound="true"]');
  return {
    hasWidget: bound !== null,
    dotCount: bound ? bound.children.length : 0,
    supportsLinear: CSS.supports("animation-timing-function", "linear(0, 0.5, 1)"),
  };
});
console.log("widget:", JSON.stringify(widgetInfo));

await page.evaluate(() => {
  const track = document.querySelector("[data-carousel-track]");
  const widget = document.querySelector('[data-motion-bound="true"]');
  const dot = widget ? widget.children[Math.floor(widget.children.length / 2) - 1] : null;
  const rec = { frames: [], marks: [] };
  window.__rec = rec;
  window.__mark = (name) => rec.marks.push({ t: performance.now(), name });
  const tick = (t) => {
    const tm = new DOMMatrixReadOnly(getComputedStyle(track).transform);
    let dx = 0;
    let dAnims = 0;
    if (dot) {
      const dm = new DOMMatrixReadOnly(getComputedStyle(dot).transform);
      dx = dm.m41;
      dAnims = dot.getAnimations().length;
    }
    rec.frames.push([t, tm.m41, track.getAnimations().length, dx, dAnims]);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const click = () =>
  page.evaluate(() => {
    window.__mark("click");
    document.querySelector('button[aria-label="Next slide"]').click();
  });

// Single click, wait for settle, then a repeat burst.
await click();
await page.waitForTimeout(5000);
await click();
await page.waitForTimeout(350);
await click();
await page.waitForTimeout(350);
await click();
await page.waitForTimeout(5200);

const rec = await page.evaluate(() => window.__rec);
await browser.close();

// ---- analysis ----
const { frames, marks } = rec;
const t0 = marks[0].t;
const rel = (t) => Math.round(t - t0);

// Per-click: first track motion, first widget motion, WAAPI presence.
for (const mark of marks) {
  const before = frames.filter((f) => f[0] <= mark.t).at(-1) ?? frames[0];
  const trackMoved = frames.find(
    (f) => f[0] > mark.t && Math.abs(f[1] - before[1]) > 0.5,
  );
  const dotMoved = frames.find(
    (f) => f[0] > mark.t && Math.abs(f[3] - before[3]) > 0.25,
  );
  const during = frames.filter((f) => f[0] > mark.t + 50 && f[0] < mark.t + 400);
  const trackAnims = during.length ? Math.max(...during.map((f) => f[2])) : 0;
  const dotAnims = during.length ? Math.max(...during.map((f) => f[4])) : 0;
  console.log(
    `click@${rel(mark.t)}ms  track-first-motion=${trackMoved ? Math.round(trackMoved[0] - mark.t) : "n/a"}ms` +
      `  dot-first-motion=${dotMoved ? Math.round(dotMoved[0] - mark.t) : "n/a"}ms` +
      `  trackWAAPI=${trackAnims}  dotWAAPI=${dotAnims}`,
  );
}

// Stalls & reversals on the track across the whole recording.
let stalls = 0;
let reversals = 0;
const dir = Math.sign(frames.at(-1)[1] - frames[0][1]) || -1;
for (let i = 1; i < frames.length; i += 1) {
  const dt = frames[i][0] - frames[i - 1][0];
  const dx = frames[i][1] - frames[i - 1][1];
  if (dt > 45) stalls += 1;
  if (dir * dx < -1 && Math.abs(dx) < 100) reversals += 1;
}
console.log(`track: stalls>45ms=${stalls} reversals=${reversals} frames=${frames.length}`);

// Widget/track settle correlation for the last motion: last frame where each
// was still moving.
const lastTrackMove = [...frames].reverse().find((f, i, arr) => {
  const next = arr[i - 1];
  return next && Math.abs(next[1] - f[1]) > 0.3;
});
const lastDotMove = [...frames].reverse().find((f, i, arr) => {
  const next = arr[i - 1];
  return next && Math.abs(next[3] - f[3]) > 0.15;
});
if (lastTrackMove && lastDotMove) {
  console.log(
    `settle: track last-motion @${rel(lastTrackMove[0])}ms, widget @${rel(lastDotMove[0])}ms, drift=${Math.round(Math.abs(lastTrackMove[0] - lastDotMove[0]))}ms`,
  );
}
