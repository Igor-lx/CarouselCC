/**
 * Flick-memory verification (tablet-ish landscape, the reported case).
 *
 *  1. FAST 30px swipe + 250ms finger stick before lift-off:
 *     - distance (30px) is UNDER the slot-relative commit threshold (~50px),
 *     - the old model decayed the velocity to ~0 during the stick -> no
 *       flick, no distance -> snap back;
 *     - the new flick memory survives the stick -> commits as a flick.
 *  2. SLOW 30px drag + the same stick: still snaps back (memory of a slow
 *     gesture is honestly slow — no false flicks).
 */
import { chromium, devices } from "playwright-core";

const BASE = "http://localhost:4173/CarouselCC/";
const LANDSCAPE = { width: 915, height: 412 };

const touchGesture = async (page, totalDx, moveMs, stickMs) => {
  const viewport = await page.$("[data-carousel-viewport]");
  const box = await viewport.boundingBox();
  const startX = box.x + box.width * 0.6;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const steps = 6;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: startX, y }],
  });
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: startX - (totalDx * i) / steps, y }],
    });
    if (moveMs > 0) await page.waitForTimeout(moveMs / steps);
  }
  if (stickMs > 0) await page.waitForTimeout(stickMs); // finger stays down, still
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
};

const anchor = (page) =>
  page.evaluate(() => {
    const imgs = [...document.querySelectorAll("[data-carousel-track] img")];
    const visible = imgs
      .map((img) => ({ src: img.currentSrc || img.src, x: img.getBoundingClientRect().x }))
      .filter((e) => e.x > -30 && e.x < window.innerWidth)
      .sort((a, b) => a.x - b.x);
    return visible[0];
  });

const anchorX = (page, src, lastX) =>
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

const run = async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ ...devices["Pixel 7"], viewport: LANDSCAPE });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const results = [];
  const check = (name, ok, detail) => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
  };

  // --- 1: fast 30px + 250ms stick -> must COMMIT (flick memory) --------------
  let a = await anchor(page);
  await touchGesture(page, 30, 40, 250); // ~0.75 px/ms mid-gesture, then stick
  await page.waitForTimeout(2600);
  let xAfter = await anchorX(page, a.src, a.x);
  const committed = xAfter === null || xAfter < a.x - 100;
  check(
    "fast 30px swipe + 250ms stick COMMITS (weighted-average flick)",
    committed,
    `anchor ${a.src.split("/").pop()} x ${Math.round(a.x)} -> ${xAfter === null ? "moved off" : Math.round(xAfter)}`,
  );

  // --- 2: slow 30px + same stick -> still snaps back --------------------------
  a = await anchor(page);
  await touchGesture(page, 30, 900, 250); // ~0.03 px/ms — honestly slow
  await page.waitForTimeout(2600);
  xAfter = await anchorX(page, a.src, a.x);
  const stayed = xAfter !== null && Math.abs(xAfter - a.x) < 30;
  check(
    "slow 30px drag + stick still snaps back (no false flicks)",
    stayed,
    `anchor ${a.src.split("/").pop()} x ${Math.round(a.x)} -> ${xAfter === null ? "unmounted" : Math.round(xAfter)}`,
  );

  await browser.close();
  const failed = results.filter((r) => !r).length;
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nALL CHECKS PASSED");
  process.exit(failed ? 1 : 0);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
