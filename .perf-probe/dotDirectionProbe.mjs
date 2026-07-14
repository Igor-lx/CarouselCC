/**
 * GO_TO dot-scale direction verification (desktop, dots pagination).
 *
 * The track transform re-bases when the render window re-anchors, so raw
 * transform X is NOT comparable across commands. Instead each check tracks a
 * real slide (by img src) on screen: deck rides forward -> that slide's
 * viewport X decreases; rides backward -> increases.
 *
 *  1. even deck: 0 -> opposite dot rides forward; opposite -> 0 rides
 *     BACKWARD (old model rode forward both ways);
 *  2. from the last dot, a dot to the left rides BACKWARD (old model could
 *     wrap forward when the cyclic path was shorter).
 */
import { chromium } from "playwright-core";

const BASE = "http://localhost:4173/CarouselCC/";
const DESKTOP = { width: 1440, height: 900 };

const clickDot = (page, index) =>
  page.$$eval("[class*='paginationWrapper'] button", (dots, i) => dots[i].click(), index);

const settle = (page) => page.waitForTimeout(2600);

/** Viewport X of the leftmost visible slide img; returns {src, x}. */
const grabAnchor = (page) =>
  page.evaluate(() => {
    const imgs = [...document.querySelectorAll("[data-carousel-track] img")];
    const visible = imgs
      .map((img) => ({ src: img.currentSrc || img.src, x: img.getBoundingClientRect().x }))
      .filter((e) => e.x > -50 && e.x < window.innerWidth)
      .sort((a, b) => a.x - b.x);
    return visible[0] ?? null;
  });

/** X of the mounted img matching src nearest to lastX (clones share src). */
const findAnchorX = (page, src, lastX) =>
  page.evaluate(
    ({ src, lastX }) => {
      const xs = [...document.querySelectorAll("[data-carousel-track] img")]
        .filter((img) => (img.currentSrc || img.src) === src)
        .map((img) => img.getBoundingClientRect().x);
      if (!xs.length) return null;
      xs.sort((a, b) => Math.abs(a - lastX) - Math.abs(b - lastX));
      return xs[0];
    },
    { src, lastX },
  );

const rideDirection = async (page, dotIndex) => {
  const anchor = await grabAnchor(page);
  await clickDot(page, dotIndex);
  await page.waitForTimeout(300);
  const xNow = await findAnchorX(page, anchor.src, anchor.x);
  if (xNow === null) return { moved: null, detail: `anchor ${anchor.src.split("/").pop()} unmounted` };
  const delta = xNow - anchor.x;
  return {
    moved: delta < -20 ? "forward" : delta > 20 ? "backward" : "none",
    detail: `anchor=${anchor.src.split("/").pop()} x ${Math.round(anchor.x)} -> ${Math.round(xNow)}`,
  };
};

const run = async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  const results = [];
  const check = (name, ok, detail) => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
  };

  const dotCount = await page.$$eval("[class*='paginationWrapper'] button", (d) => d.length);
  console.log(`dots: ${dotCount}`);
  const half = Math.floor(dotCount / 2);

  let r = await rideDirection(page, half);
  check(`0 -> ${half}: rides forward`, r.moved === "forward", r.detail);
  await settle(page);

  r = await rideDirection(page, 0);
  check(`${half} -> 0: rides BACKWARD`, r.moved === "backward", r.detail);
  await settle(page);

  const last = dotCount - 1;
  await clickDot(page, last);
  await settle(page);
  const target = Math.max(0, last - 2);
  r = await rideDirection(page, target);
  check(`${last} -> ${target}: rides BACKWARD (no forward wrap)`, r.moved === "backward", r.detail);
  await settle(page);

  await ctx.close();
  await browser.close();
  const failed = results.filter((x) => !x).length;
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nALL CHECKS PASSED");
  process.exit(failed ? 1 : 0);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
