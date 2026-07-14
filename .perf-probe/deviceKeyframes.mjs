/**
 * Capture the EXACT keyframes the track receives on REAL swipes, by hooking
 * Element.prototype.animate in the page. Then reconstruct the velocity the
 * compositor actually traces (WAAPI interpolates LINEARLY between keyframes),
 * and look for stalls / velocity jumps in the real curve.
 */
import { chromium } from "playwright-core";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes("CarouselCC")) ?? browser.contexts().flatMap(c => c.pages())[0];
await page.bringToFront();
await page.goto("https://igor-lx.github.io/CarouselCC/?cb=" + Date.now(), { waitUntil: "load" });
await page.waitForTimeout(1500);

await page.evaluate(() => {
  const w = window;
  w.__kf = [];
  const orig = Element.prototype.animate;
  Element.prototype.animate = function (kf, opts) {
    try {
      if (this.hasAttribute && this.hasAttribute("data-carousel-track")) {
        w.__kf.push({
          t: performance.now(),
          duration: opts && opts.duration,
          startTime: null,
          frames: (kf || []).map(f => f.transform),
        });
      }
    } catch {}
    return orig.call(this, kf, opts);
  };
  w.__go = false;
  addEventListener("touchstart", () => { w.__go = true; }, { capture: true, once: true });
});

console.log(">>> ARMED — swipe now (12s of swipes) <<<");
await page.waitForFunction("window.__go===true", null, { timeout: 0 });
await page.waitForTimeout(12000);
const kf = await page.evaluate(() => window.__kf);
await browser.close();

const px = s => { const m = /translate3d\((-?[\d.]+)px/.exec(s || ""); return m ? parseFloat(m[1]) : NaN; };

console.log(`\ntrack animations captured: ${kf.length}\n`);
kf.forEach((a, n) => {
  const xs = a.frames.map(px).filter(v => !Number.isNaN(v));
  if (xs.length < 3) return;
  const dur = a.duration;
  const dt = dur / (xs.length - 1);
  const steps = [];
  for (let i = 1; i < xs.length; i++) steps.push(xs[i] - xs[i - 1]);
  const total = xs[xs.length - 1] - xs[0];
  console.log(`--- ride #${n + 1}: ${Math.abs(total).toFixed(0)}px over ${dur.toFixed(0)}ms, ${xs.length} keyframes (${dt.toFixed(0)}ms each) ---`);
  console.log("  px per keyframe: " + steps.map(s => Math.abs(s).toFixed(1).padStart(5)).join(""));
  // stalls: a keyframe interval with (near) zero travel while neighbours move
  const stalls = [];
  for (let i = 1; i < steps.length - 1; i++) {
    const nb = (Math.abs(steps[i - 1]) + Math.abs(steps[i + 1])) / 2;
    if (nb > 1 && Math.abs(steps[i]) <= nb * 0.4)
      stalls.push(`kf ${i}/${steps.length} (+${(i * dt).toFixed(0)}ms, ${(100 * i / steps.length).toFixed(0)}% of ride): ${Math.abs(steps[i]).toFixed(1)}px vs neighbours ${nb.toFixed(1)}px`);
  }
  // velocity jumps between consecutive intervals
  let maxJump = 0, at = 0;
  for (let i = 1; i < steps.length; i++) {
    const p = Math.abs(steps[i - 1]), c = Math.abs(steps[i]);
    if (p > 0.5) { const j = Math.abs(c - p) / p; if (j > maxJump) { maxJump = j; at = i; } }
  }
  console.log(stalls.length ? "  >>> STALL: " + stalls.join("; ") : "  no stall");
  console.log(`  worst velocity jump: ${(maxJump * 100).toFixed(0)}% at kf ${at} (${(100 * at / steps.length).toFixed(0)}% of ride)`);
});
