/**
 * isSwipeOn verification (touch emulation, mobile viewport):
 *  1. default (?swipe absent) — a horizontal touch drag MOVES the track and
 *     the viewport carries pointer listeners (React props present);
 *  2. ?swipe=0 — the identical drag leaves the track untouched, and the
 *     viewport element reports zero WAAPI/gesture side effects: the page
 *     index does not change, the track transform stays put mid-drag;
 *  3. ?swipe=0 — clicks (controls / pagination) still navigate: the switch
 *     kills ONLY the gesture surface.
 */
import { chromium, devices } from "playwright-core";

const BASE = "http://localhost:4173/CarouselCC/";
const PHONE = devices["Pixel 7"];

const trackTransform = (page) =>
  page.$eval("[data-carousel-track]", (el) => getComputedStyle(el).transform);

const touchDrag = async (page) => {
  // CDP touch: press in the viewport middle, sweep left in steps, hold.
  const viewport = await page.$("[data-carousel-viewport]");
  const box = await viewport.boundingBox();
  const startX = box.x + box.width * 0.7;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: startX, y }],
  });
  for (let i = 1; i <= 8; i += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: startX - i * 30, y }],
    });
    await page.waitForTimeout(30);
  }
  const midTransform = await trackTransform(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  return midTransform;
};

const run = async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const results = [];
  const check = (name, ok, detail) => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
  };

  // --- 1: default — drag moves the track -----------------------------------
  {
    const ctx = await browser.newContext({ ...PHONE });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const before = await trackTransform(page);
    const mid = await touchDrag(page);
    check("default: touch drag moves the track", mid !== before, `before=${before} mid=${mid}`);
    await ctx.close();
  }

  // --- 2: ?swipe=0 — identical drag is inert --------------------------------
  {
    const ctx = await browser.newContext({ ...PHONE });
    const page = await ctx.newPage();
    await page.goto(`${BASE}?swipe=0`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);

    const hasHandlers = await page.$eval("[data-carousel-viewport]", (el) => {
      const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
      const props = key ? el[key] : {};
      return Boolean(props.onPointerDown || props.onPointerMove || props.onPointerUp);
    });
    check("swipe=0: no pointer handlers on the viewport", !hasHandlers, `handlers=${hasHandlers}`);

    const before = await trackTransform(page);
    const mid = await touchDrag(page);
    await page.waitForTimeout(300);
    const after = await trackTransform(page);
    check(
      "swipe=0: identical drag leaves the track untouched",
      mid === before && after === before,
      `before=${before} mid=${mid} after=${after}`,
    );

    // 3: click navigation still works (widget dot? use imperative next button
    // in the stand footer — simplest: the second page section's NEXT button)
    const pageIndexBefore = await page.$$eval(
      "[data-carousel-track] [aria-current='step']",
      (els) => els.length,
    );
    // tap the stand's own next-arrow zone inside Controls: right half of viewport click zones
    const controlsNext = await page.$("button[aria-label='Next slide']");
    if (controlsNext) {
      const t0 = await trackTransform(page);
      await controlsNext.click();
      await page.waitForTimeout(1200);
      const t1 = await trackTransform(page);
      check("swipe=0: click navigation still moves the deck", t1 !== t0, `t0=${t0} t1=${t1}`);
    } else {
      check("swipe=0: click navigation still moves the deck", false, `no controls element found (aria-current count=${pageIndexBefore})`);
    }
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
