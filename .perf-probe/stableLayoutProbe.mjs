/**
 * Stable-layout smoke check (local preview :4173). Verifies the absolute-lane
 * layout renders and scrolls correctly:
 *  - the ACTIVE slide is flush to the viewport's left edge at rest (lane +
 *    track transform cancel exactly — the core layoutOrigin invariant);
 *  - the track has a real height (sizer works), slides don't overlap;
 *  - a Next click advances the deck and it comes to rest flush again.
 */
import { chromium, devices } from "playwright-core";

const BASE = "http://localhost:4173/CarouselCC/";

const geom = (page) =>
  page.evaluate(() => {
    const viewport = document.querySelector("[data-carousel-viewport]");
    const track = document.querySelector("[data-carousel-track]");
    const active = document.querySelector(
      "[data-carousel-track] [data-active-zone='true']",
    );
    const all = [...document.querySelectorAll("[data-carousel-track] [data-active-zone]")]
      .map((s) => s.getBoundingClientRect())
      .sort((a, b) => a.x - b.x);
    const vr = viewport.getBoundingClientRect();
    const ar = active?.getBoundingClientRect();
    let minGap = Infinity;
    for (let i = 1; i < all.length; i += 1) minGap = Math.min(minGap, all[i].x - all[i - 1].x - all[i - 1].width);
    return {
      viewportW: Math.round(vr.width),
      trackH: Math.round(track.getBoundingClientRect().height),
      activeX: ar ? Math.round(ar.x - vr.x) : null,
      activeW: ar ? Math.round(ar.width) : null,
      activeSrc: active?.querySelector("img")?.currentSrc ?? null,
      minGap: Number.isFinite(minGap) ? Math.round(minGap) : null,
    };
  });

const run = async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const results = [];
  const check = (name, ok, detail) => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
  };

  // Desktop (3 visible)
  {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const a = await geom(page);
    check("desktop: track has height", a.trackH > 50, `trackH=${a.trackH}`);
    check(
      "desktop: ACTIVE slide flush to viewport left at rest",
      a.activeX !== null && Math.abs(a.activeX) <= 2,
      `activeX=${a.activeX}`,
    );
    check(
      "desktop: slides don't overlap (gap >= 0)",
      a.minGap !== null && a.minGap >= 0,
      `minGap=${a.minGap}`,
    );

    // nav zones are pointer-events:none until viewport hover on desktop
    await page.locator("[data-carousel-viewport]").hover();
    await page.locator('button[aria-label="Next slide"]').click();
    await page.waitForTimeout(2800);
    const b = await geom(page);
    check("desktop: Next advanced the active slide", b.activeSrc !== a.activeSrc, "active changed");
    check(
      "desktop: ACTIVE flush again after ride (stable rest)",
      b.activeX !== null && Math.abs(b.activeX) <= 2,
      `activeX=${b.activeX}`,
    );
    await ctx.close();
  }

  // Portrait mobile (1 visible)
  {
    const ctx = await browser.newContext({ ...devices["Pixel 7"], viewport: { width: 412, height: 915 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const a = await geom(page);
    check("portrait: track has height", a.trackH > 50, `trackH=${a.trackH}`);
    check(
      "portrait: single slide ~= viewport width",
      a.activeW !== null && Math.abs(a.activeW - a.viewportW) <= 3,
      `slideW=${a.activeW} vw=${a.viewportW}`,
    );
    check(
      "portrait: ACTIVE slide flush to viewport left",
      a.activeX !== null && Math.abs(a.activeX) <= 2,
      `activeX=${a.activeX}`,
    );
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r).length;
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nALL CHECKS PASSED");
  process.exit(failed ? 1 : 0);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
