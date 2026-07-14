/**
 * ResponsiveImages module verification (portrait phone viewport, local
 * preview at :4173). The stand mounts the module unconditionally, warm
 * transport is a detached Image (no <link rel=preload> ever):
 *  1. responsive markup present (sources + srcset), portrait aspect flip;
 *  2. zero preload links, zero link-preload console warnings;
 *  3. idle warming fetches MORE image resources than are rendered
 *     (neighbour pages + the current page's parallel crops).
 */
import { chromium, devices } from "playwright-core";

const BASE = "http://localhost:4173/CarouselCC/";
const PORTRAIT = { width: 412, height: 915 };

const run = async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const results = [];
  const check = (name, ok, detail) => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
  };

  const ctx = await browser.newContext({ ...devices["Pixel 7"], viewport: PORTRAIT });
  const page = await ctx.newPage();
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning" && /preload/i.test(message.text()))
      warnings.push(message.text());
  });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500); // idle -> warm queue drains

  const state = await page.evaluate(() => {
    const slide = document.querySelector(
      "[data-carousel-track] [data-active-zone='true']",
    );
    const img = slide?.querySelector("img");
    const rect = slide?.getBoundingClientRect();
    const fetched = performance
      .getEntriesByType("resource")
      .filter((entry) => /\.(avif|webp|jpe?g|png)/i.test(entry.name)).length;
    const rendered = new Set(
      [...document.querySelectorAll("[data-carousel-track] img")]
        .map((image) => image.currentSrc)
        .filter(Boolean),
    ).size;
    return {
      sourceCount: slide?.querySelectorAll("source").length ?? -1,
      srcset: Boolean(img?.getAttribute("srcset")),
      aspect: rect ? rect.width / rect.height : 0,
      preloadLinks: document.querySelectorAll("link[rel='preload'][as='image']")
        .length,
      fetched,
      rendered,
    };
  });

  check(
    "responsive markup present",
    state.sourceCount > 0 && state.srcset,
    `sources=${state.sourceCount} srcset=${state.srcset}`,
  );
  check(
    "portrait aspect flip active (box taller than wide)",
    state.aspect < 1,
    `aspect=${state.aspect.toFixed(2)}`,
  );
  check(
    "no preload links (Image transport)",
    state.preloadLinks === 0,
    `links=${state.preloadLinks}`,
  );
  check(
    "no link-preload console warnings",
    warnings.length === 0,
    `warnings=${warnings.length}`,
  );
  check(
    "idle warming fetched beyond the rendered set",
    state.fetched > state.rendered,
    `fetched=${state.fetched} rendered=${state.rendered}`,
  );

  await ctx.close();
  await browser.close();
  const failed = results.filter((r) => !r).length;
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nALL CHECKS PASSED");
  process.exit(failed ? 1 : 0);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
