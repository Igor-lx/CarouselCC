/** Do the slide images actually load on the local rig? If not, every number from it is suspect. */
import { chromium } from "playwright-core";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().startsWith("http"));
await page.bringToFront();

const bad = [];
page.on("response", (r) => {
  if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
});

await page.goto("http://127.0.0.1:8080/on/", { waitUntil: "load" });
await page.waitForTimeout(3500);

const state = await page.evaluate(() => ({
  slides: document.querySelectorAll('[class*="_slide_"]').length,
  errorSlides: document.querySelectorAll('[class*="slideError"]').length,
  images: [...document.querySelectorAll("img")].map((i) => ({
    complete: i.complete,
    w: i.naturalWidth,
    src: i.currentSrc.split("/").pop(),
  })),
}));

console.log(`failed requests: ${bad.length}`);
bad.slice(0, 6).forEach((b) => console.log(`  ${b}`));
console.log(`\nslides ${state.slides}, errorSlides ${state.errorSlides}`);
state.images.slice(0, 8).forEach((i) =>
  console.log(`  ${i.complete ? "ok " : "PENDING"} ${String(i.w).padStart(5)}px  ${i.src}`),
);

await browser.close();
