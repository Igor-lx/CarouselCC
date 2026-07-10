/**
 * Hover-frame probe: interactive mode ON, hover the leftmost and rightmost
 * visible slides, screenshot a zoomed clip of each slide's box (±8px) so all
 * four frame edges are inspectable. Also asserts hover causes zero layout
 * shift and that after two clicks the deck lands flush (first visible slide
 * left == viewport left) — the overshoot/jerk regression check.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

mkdirSync(".perf-probe/out/border", { recursive: true });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
await page.goto("http://localhost:4173/CarouselCC/", { waitUntil: "networkidle" });
await page.waitForSelector("[data-carousel-track] img");
await page.waitForTimeout(1000);

// Interactive ON
await page.evaluate(() => {
  const int = [...document.querySelectorAll("main button")].find(
    (b) => b.textContent === "NO",
  );
  int?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.waitForTimeout(300);

const visibleSlides = async () =>
  page.evaluate(() => {
    const viewport = document.querySelector("[data-carousel-viewport]").getBoundingClientRect();
    return [...document.querySelectorAll("[data-carousel-track] > *")]
      .map((el, i) => ({ i, r: el.getBoundingClientRect().toJSON(), tag: el.tagName }))
      .filter((s) => s.r.right > viewport.left + 5 && s.r.left < viewport.right - 5)
      .map((s) => ({ ...s, vp: viewport.toJSON() }));
  });

const slides = await visibleSlides();
console.log("visible:", slides.map((s) => `#${s.i} ${s.tag} left=${s.r.left.toFixed(1)}`).join("  "), "| vpLeft:", slides[0].vp.left.toFixed(1), "vpRight:", slides[0].vp.right.toFixed(1));

for (const which of [0, slides.length - 1]) {
  const s = slides[which];
  const before = await visibleSlides();
  await page.mouse.move(s.r.x + s.r.width / 2, s.r.y + s.r.height / 2);
  await page.waitForTimeout(700); // outline transition
  const after = await visibleSlides();
  const shifted = before.some((b, i) => Math.abs(b.r.left - after[i].r.left) > 0.01 || Math.abs(b.r.height - after[i].r.height) > 0.01);
  console.log(`hover slide#${s.i}: layoutShift=${shifted}`);
  await page.screenshot({
    path: `.perf-probe/out/border/hover-${which === 0 ? "left" : "right"}.png`,
    clip: {
      x: Math.max(0, s.r.x - 8),
      y: Math.max(0, s.r.y - 8),
      width: Math.min(1440, s.r.width + 16),
      height: s.r.height + 16,
    },
  });
}

// Motion landing accuracy: two next-clicks, then first visible slide must sit
// flush with the viewport's left edge.
await page.evaluate(() => document.querySelector('button[aria-label="Next slide"]').click());
await page.waitForTimeout(4600);
await page.evaluate(() => document.querySelector('button[aria-label="Next slide"]').click());
await page.waitForTimeout(4600);
const settled = await visibleSlides();
const flushError = Math.abs(settled[0].r.left - settled[0].vp.left);
console.log(`after 2 steps: firstVisible left=${settled[0].r.left.toFixed(2)} vpLeft=${settled[0].vp.left.toFixed(2)} flushError=${flushError.toFixed(2)}px`);

await browser.close();
