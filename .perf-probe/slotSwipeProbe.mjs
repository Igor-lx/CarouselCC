/**
 * Slot-adaptive swipe threshold verification.
 *
 * Landscape phone (wide host, 2 visible slides -> slot ~ host/2):
 *  - OLD model: commit needed ~10.8% of the HOST (~99px on 915px) — a slow
 *    70px drag snapped back;
 *  - NEW model: commit needs SWIPE_COMMIT_SLOT_SHARE of the SLOT
 *    (~0.11 * ~450 = ~50px) — the same 70px drag must COMMIT.
 * Also: a clearly sub-threshold slow drag (30px) must still snap back.
 *
 * Drags are SLOW (many small steps with waits) so the quick-flick path
 * cannot fire; direction is read by tracking a slide img on screen.
 */
import { chromium, devices } from "playwright-core";

const BASE = "http://localhost:4173/CarouselCC/";
const LANDSCAPE = { width: 915, height: 412 };

const slowTouchDrag = async (page, totalDx) => {
  const viewport = await page.$("[data-carousel-viewport]");
  const box = await viewport.boundingBox();
  const startX = box.x + box.width * 0.6;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const steps = 14;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: startX, y }],
  });
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: startX - (totalDx * i) / steps, y }],
    });
    await page.waitForTimeout(60); // slow: kills the quick-flick velocity path
  }
  await page.waitForTimeout(250); // let velocity EMA decay before release
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

  // --- 70px slow drag: must COMMIT (old model snapped back) ------------------
  let a = await anchor(page);
  await slowTouchDrag(page, 70);
  await page.waitForTimeout(2600); // settle
  let xAfter = await anchorX(page, a.src, a.x);
  const movedForward = xAfter === null || xAfter < a.x - 100;
  check(
    "slow 70px drag on landscape COMMITS a page (slot-relative threshold)",
    movedForward,
    `anchor ${a.src.split("/").pop()} x ${Math.round(a.x)} -> ${xAfter === null ? "unmounted (moved off)" : Math.round(xAfter)}`,
  );

  // --- 30px slow drag: still snaps back --------------------------------------
  a = await anchor(page);
  await slowTouchDrag(page, 30);
  await page.waitForTimeout(2600);
  xAfter = await anchorX(page, a.src, a.x);
  const stayed = xAfter !== null && Math.abs(xAfter - a.x) < 30;
  check(
    "slow 30px drag still snaps back (floor intact)",
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
