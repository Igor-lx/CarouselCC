/**
 * Image-geometry audit: for several viewports, measures the slide box vs the
 * rendered <img> (natural aspect vs box aspect => how much object-fit crops),
 * the carousel's fit within the window, nav-zone vs slide alignment, and the
 * interactive-mode effect. Saves a screenshot per case.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const URL = "http://localhost:4173/CarouselCC/" + (process.env.SLIDES ? "?slides=" + process.env.SLIDES : "");
mkdirSync(".perf-probe/out/img-audit", { recursive: true });

const CASES = [
  { label: "wide-1920", viewport: { width: 1920, height: 1080 } },
  { label: "laptop-1440x800", viewport: { width: 1440, height: 800 } },
  { label: "phone-portrait", viewport: { width: 390, height: 780 }, touch: true },
  { label: "phone-landscape", viewport: { width: 780, height: 390 }, touch: true },
];

const browser = await chromium.launch({ channel: "msedge", headless: true });

for (const c of CASES) {
  const context = await browser.newContext({
    viewport: c.viewport,
    hasTouch: Boolean(c.touch),
    isMobile: Boolean(c.touch),
  });
  const page = await context.newPage();
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-carousel-track] img");
  await page.waitForTimeout(1200);

  for (const interactive of [false, true]) {
    if (interactive) {
      // App header INT toggle is the 3rd button
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll("main button")];
        const int = buttons.find((b) => b.textContent === "NO" || b.textContent === "INT");
        int?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await page.waitForTimeout(400);
    }
    const data = await page.evaluate(() => {
      const root = document.querySelector("[data-carousel-root]");
      const viewport = document.querySelector("[data-carousel-viewport]");
      const slides = [...document.querySelectorAll("[data-carousel-track] > *")];
      const actual = slides.find((s) => s.getAttribute("data-active-zone") === "true");
      const img = actual?.querySelector("img");
      const slideRect = actual?.getBoundingClientRect();
      const imgRect = img?.getBoundingClientRect();
      const zone = viewport.querySelector('button[aria-label="Next slide"]');
      return {
        window: { w: innerWidth, h: innerHeight },
        rootRect: root.getBoundingClientRect().toJSON(),
        viewportRect: viewport.getBoundingClientRect().toJSON(),
        slideTag: actual?.tagName,
        slide: slideRect ? { w: +slideRect.width.toFixed(1), h: +slideRect.height.toFixed(1), top: +slideRect.top.toFixed(1), ar: +(slideRect.width / slideRect.height).toFixed(3) } : null,
        img: imgRect ? { w: +imgRect.width.toFixed(1), h: +imgRect.height.toFixed(1), top: +imgRect.top.toFixed(1) } : null,
        imgNatural: img ? { w: img.naturalWidth, h: img.naturalHeight, ar: +(img.naturalWidth / img.naturalHeight).toFixed(3) } : null,
        imgSrc: img?.currentSrc?.split("/").slice(-3).join("/"),
        objectFit: img ? getComputedStyle(img).objectFit : null,
        zoneRect: zone ? { h: +zone.getBoundingClientRect().height.toFixed(1), top: +zone.getBoundingClientRect().top.toFixed(1) } : null,
      };
    });
    const tag = interactive ? "int" : "plain";
    console.log(`\n=== ${c.label} [${tag}] ===`);
    console.log(JSON.stringify(data));
    await page.screenshot({ path: `.perf-probe/out/img-audit/${c.label}-${tag}.png` });
  }
  await context.close();
}
await browser.close();
