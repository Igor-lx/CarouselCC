/**
 * Orientation-swap veil verification.
 *
 * Emulates a device rotation (viewport swap) with a THROTTLED network, so the
 * new orientation crop cannot arrive instantly:
 *  1. during the swap window the visible imgs carry data-reorienting="true"
 *     and computed opacity heads to 0 (the stale-crop artefact is masked);
 *  2. after the new crop decodes, the attribute is gone and opacity is 1;
 *  3. a second rotation on warm cache clears near-instantly (no stuck veil).
 */
import { chromium, devices } from "playwright-core";

const BASE = "http://localhost:4173/CarouselCC/";
const PORTRAIT = { width: 412, height: 915 };
const LANDSCAPE = { width: 915, height: 412 };

const veilState = (page) =>
  page.$$eval("[data-carousel-track] img", (imgs) => {
    const visible = imgs.filter((img) => {
      const rect = img.getBoundingClientRect();
      return rect.width > 0 && rect.right > 0 && rect.left < window.innerWidth;
    });
    return {
      total: visible.length,
      veiled: visible.filter((img) => img.dataset.reorienting === "true").length,
      opacities: visible.map((img) => Number(getComputedStyle(img).opacity)),
    };
  });

const run = async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({
    ...devices["Pixel 7"],
    viewport: PORTRAIT,
  });
  const page = await ctx.newPage();

  const results = [];
  const check = (name, ok, detail) => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
  };

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  // Throttle AFTER initial load so only the rotation fetch is slow.
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 400,
    downloadThroughput: (300 * 1024) / 8,
    uploadThroughput: (300 * 1024) / 8,
  });

  // --- rotate portrait -> landscape (cold: landscape crops not fetched) ----
  await page.setViewportSize(LANDSCAPE);
  await page.waitForTimeout(120); // inside the swap window
  const during = await veilState(page);
  check(
    "cold rotation: visible imgs veiled during the swap window",
    during.total > 0 && during.veiled === during.total && Math.min(...during.opacities) < 1,
    `veiled=${during.veiled}/${during.total} opacities=[${during.opacities.map((o) => o.toFixed(2)).join(",")}]`,
  );

  await page.waitForTimeout(4000); // let the throttled crop arrive + decode
  const after = await veilState(page);
  check(
    "after decode: veil cleared, full opacity",
    after.veiled === 0 && Math.min(...after.opacities) === 1,
    `veiled=${after.veiled}/${after.total} opacities=[${after.opacities.map((o) => o.toFixed(2)).join(",")}]`,
  );

  // --- rotate back (portrait crops are warm) --------------------------------
  await page.setViewportSize(PORTRAIT);
  await page.waitForTimeout(700);
  const warm = await veilState(page);
  check(
    "warm rotation: veil self-clears quickly (no stuck veil)",
    warm.veiled === 0 && Math.min(...warm.opacities) === 1,
    `veiled=${warm.veiled}/${warm.total} opacities=[${warm.opacities.map((o) => o.toFixed(2)).join(",")}]`,
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
