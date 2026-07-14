import { chromium } from "playwright-core";

const run = async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await page.goto("http://localhost:4173/CarouselCC/", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  await page.$$eval("[class*='paginationWrapper'] button", (dots) => dots[2].click());
  await page.waitForTimeout(150); // mid-fade: dots are on compositor layers

  const clearance = await page.evaluate(() => {
    const outer = document
      .querySelector("[data-carousel-root]")
      .getBoundingClientRect();
    const dots = [...document.querySelectorAll("[class*='paginationWrapper'] button")];
    const maxBottom = Math.max(...dots.map((d) => d.getBoundingClientRect().bottom));
    return outer.bottom - maxBottom;
  });

  const ok = clearance >= 3;
  console.log(
    `${ok ? "PASS" : "FAIL"}  mid-fade clearance below dots: ${clearance.toFixed(2)}px`,
  );
  await browser.close();
  process.exit(ok ? 0 : 1);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
