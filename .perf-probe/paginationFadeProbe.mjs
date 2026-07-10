/**
 * Variant B verification: pagination dots must cross-fade over the engine
 * plan (WAAPI), not flip via the CSS transition, for planned motions.
 *
 * Checks:
 *  1. CLICK on a dot -> both affected dots carry a WAAPI Animation; the
 *     incoming dot's painted opacity mid-motion is strictly between the
 *     resting (0.2) and active (0.8) values; on settle it equals 0.8.
 *  2. AUTOPLAY step -> same mid-step "in-between" opacity on the incoming dot.
 *  3. RETARGET mid-fade (second click while fading) -> no opacity snap:
 *     painted opacity immediately after the retarget stays close to the
 *     value painted just before it.
 *  4. REDUCED MOTION -> no WAAPI animations on dots after a step.
 */
import { chromium } from "playwright-core";

const BASE = "http://localhost:4173/CarouselCC/";
const DESKTOP = { width: 1440, height: 900 };

const opacityOf = (page, index) =>
  page.$$eval(
    "[class*='paginationWrapper'] button",
    (dots, i) => Number.parseFloat(getComputedStyle(dots[i]).opacity),
    index,
  );

const animCountOf = (page, index) =>
  page.$$eval(
    "[class*='paginationWrapper'] button",
    (dots, i) => dots[i].getAnimations().length,
    index,
  );

const activeIndex = (page) =>
  page.$$eval("[class*='paginationWrapper'] button", (dots) =>
    dots.findIndex((d) => d.disabled),
  );

const run = async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
  };

  // --- 1 + 3: click fade and mid-fade retarget -----------------------------
  {
    const ctx = await browser.newContext({ viewport: DESKTOP });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    const from = await activeIndex(page);
    const target = (from + 2) % (await page.$$eval("[class*='paginationWrapper'] button", (d) => d.length));
    await page.$$eval(
      "[class*='paginationWrapper'] button",
      (dots, i) => dots[i].click(),
      target,
    );
    await page.waitForTimeout(120); // mid-motion

    const midOpacity = await opacityOf(page, target);
    const outAnims = await animCountOf(page, from);
    const inAnims = await animCountOf(page, target);
    check(
      "click: WAAPI fade present on both dots",
      outAnims >= 1 && inAnims >= 1,
      `outgoing=${outAnims} incoming=${inAnims}`,
    );
    check(
      "click: incoming dot opacity strictly in-between mid-motion",
      midOpacity > 0.25 && midOpacity < 0.75,
      `opacity=${midOpacity}`,
    );

    // retarget mid-fade: click one page further while still fading
    const target2 = (target + 1) % (await page.$$eval("[class*='paginationWrapper'] button", (d) => d.length));
    const before = await opacityOf(page, target);
    await page.$$eval(
      "[class*='paginationWrapper'] button",
      (dots, i) => dots[i].click(),
      target2,
    );
    await page.waitForTimeout(30);
    const after = await opacityOf(page, target);
    check(
      "retarget: no opacity snap on the abandoned dot",
      Math.abs(after - before) < 0.25,
      `before=${before} after=${after}`,
    );

    await page.waitForTimeout(2500); // settle
    const settled = await opacityOf(page, target2);
    const leftover = await animCountOf(page, target2);
    check(
      "settle: incoming dot at active opacity, fills dropped",
      Math.abs(settled - 0.8) < 0.05 && leftover === 0,
      `opacity=${settled} anims=${leftover}`,
    );
    await ctx.close();
  }

  // --- 2: autoplay step ------------------------------------------------------
  {
    const ctx = await browser.newContext({ viewport: DESKTOP });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    // the stand boots with autoplay OFF — flip the header toggle (shows ⏸️ when off)
    await page.click("text=⏸️");
    // move the pointer away so hover-pause does not hold the loop
    await page.mouse.move(5, 5);
    const before = await activeIndex(page);
    // wait for the autoplay tick to fire and catch the fade mid-step
    const caught = await page.evaluate(async () => {
      const dots = [...document.querySelectorAll("[class*='paginationWrapper'] button")];
      const start = performance.now();
      return await new Promise((resolve) => {
        const tick = () => {
          const fading = dots
            .map((d, i) => ({ i, o: Number.parseFloat(getComputedStyle(d).opacity), a: d.getAnimations().length }))
            .filter((x) => x.a > 0 && x.o > 0.25 && x.o < 0.75);
          if (fading.length) return resolve({ ok: true, sample: fading[0], waited: performance.now() - start });
          if (performance.now() - start > 12000) return resolve({ ok: false });
          requestAnimationFrame(tick);
        };
        tick();
      });
    });
    check(
      "autoplay: mid-step in-between opacity with a live WAAPI fade",
      caught.ok,
      caught.ok ? `dot=${caught.sample.i} opacity=${caught.sample.o} after ${Math.round(caught.waited)}ms (was active: ${before})` : "no fade observed in 12s",
    );
    await ctx.close();
  }

  // --- 4: reduced motion ------------------------------------------------------
  {
    const ctx = await browser.newContext({ viewport: DESKTOP, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const from = await activeIndex(page);
    const target = from + 1;
    await page.$$eval(
      "[class*='paginationWrapper'] button",
      (dots, i) => dots[i].click(),
      target,
    );
    await page.waitForTimeout(80);
    const anims = (await animCountOf(page, from)) + (await animCountOf(page, target));
    const nowActive = await activeIndex(page);
    const opacity = await opacityOf(page, target);
    check(
      "reduced motion: instant class flip, zero animations",
      anims === 0 && nowActive === target && Math.abs(opacity - 0.8) < 0.05,
      `anims=${anims} active=${nowActive} opacity=${opacity}`,
    );
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(failed.length ? `\n${failed.length} FAILURE(S)` : "\nALL CHECKS PASSED");
  process.exit(failed.length ? 1 : 0);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
