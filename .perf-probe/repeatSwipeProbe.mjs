/**
 * Repeat-swipe alignment with repeat-click semantics.
 *
 * A second committing swipe EARLY in a ride (well under 50% of page
 * progress) must target one page BEYOND the incoming one — total advance
 * after two swipes = 2 pages. The old geometry-rounded origin re-targeted
 * the already-incoming page (total = 1) when the grab happened early.
 *
 * Read via the stand's "N / M" status label (reflects the target page).
 */
import { chromium, devices } from "playwright-core";

const BASE = "http://localhost:4173/CarouselCC/";
const PORTRAIT = { width: 412, height: 915 };

const swipeLeft = async (page, dx, moveMs) => {
  const viewport = await page.$("[data-carousel-viewport]");
  const box = await viewport.boundingBox();
  const startX = box.x + box.width * 0.7;
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
      touchPoints: [{ x: startX - (dx * i) / steps, y }],
    });
    await page.waitForTimeout(moveMs / steps);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
};

const pageLabel = async (page) => {
  const text = await page.evaluate(() => {
    const spans = [...document.querySelectorAll("span")];
    const label = spans.find((s) => /^\d+ \/ \d+$/.test(s.textContent?.trim() ?? ""));
    return label?.textContent?.trim() ?? null;
  });
  return text ? Number(text.split(" / ")[0]) : null;
};

const run = async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ ...devices["Pixel 7"], viewport: PORTRAIT });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const start = await pageLabel(page);
  console.log("start page:", start);

  // First committing swipe: slow 90px drag -> ride starts at ~base speed
  // (long ride, plenty of early window).
  await swipeLeft(page, 90, 500);
  // Past the 150ms gesture cooldown, still EARLY in the ~2s ride (~12%)
  await page.waitForTimeout(230);

  // Second committing swipe while the ride has barely progressed.
  await swipeLeft(page, 80, 220);

  await page.waitForTimeout(3500); // settle everything
  const end = await pageLabel(page);
  const advanced = end !== null && start !== null ? end - start : null;
  const ok = advanced === 2;
  console.log(
    `${ok ? "PASS" : "FAIL"}  early repeat swipe advances 2 pages (beyond the incoming): ${start} -> ${end} (advance=${advanced})`,
  );
  await browser.close();
  process.exit(ok ? 0 : 1);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
