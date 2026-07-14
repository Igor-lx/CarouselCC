/** Does the animate() suppressor actually intercept anything? Verify before trusting it. */
import { chromium } from "playwright-core";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().startsWith("http"));
await page.bringToFront();
await page.goto("http://127.0.0.1:8080/on/", { waitUntil: "load" });
await page.waitForTimeout(1800);

const report = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const seen = [];
      const original = Element.prototype.animate;
      Element.prototype.animate = function patched(keyframes, options) {
        const animation = original.call(this, keyframes, options);
        seen.push({
          tag: this.tagName,
          cls: String(this.className ?? "").slice(0, 40),
          cancelled: !/slideContainer/.test(String(this.className ?? "")),
        });
        if (!/slideContainer/.test(String(this.className ?? ""))) animation.cancel();
        return animation;
      };

      document.querySelector('button[aria-label="Next slide"]')?.click();

      setTimeout(() => {
        Element.prototype.animate = original;
        resolve({
          intercepted: seen,
          liveAnimations: document.getAnimations().map((a) => ({
            cls: String(a.effect?.target?.className ?? "").slice(0, 40),
            state: a.playState,
          })),
        });
      }, 700);
    }),
);

console.log(JSON.stringify(report, null, 2));
await browser.close();
