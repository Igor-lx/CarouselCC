/** Precondition check: is the A/B page actually alive, clickable and moving? */
import { chromium } from "playwright-core";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().startsWith("http"));
if (!page) throw new Error("no page found on device");

await page.bringToFront();
await page.goto("http://127.0.0.1:8080/off/", { waitUntil: "load" });
await page.waitForTimeout(2000);

const report = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const buttons = [...document.querySelectorAll("button")].map(
        (b) => b.getAttribute("aria-label") ?? b.className,
      );
      const track = document.querySelector('[class*="slideContainer"]');
      const before = track ? getComputedStyle(track).transform : null;

      let frames = 0;
      const count = () => {
        frames += 1;
        requestAnimationFrame(count);
      };
      requestAnimationFrame(count);

      document.querySelector('button[aria-label="Next slide"]')?.click();

      setTimeout(() => {
        resolve({
          visibility: document.visibilityState,
          hidden: document.hidden,
          buttons,
          framesIn1s: frames,
          transformBefore: before,
          transformAfter: track ? getComputedStyle(track).transform : null,
          animations: document.getAnimations().length,
        });
      }, 1000);
    }),
);

console.log(JSON.stringify(report, null, 2));
await browser.close();
