/** Dump the REAL keyframes of the dot animations — the compositing blocker is usually visible in the values. */
import { chromium } from "playwright-core";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().startsWith("http"));
await page.bringToFront();
await page.goto("http://127.0.0.1:8080/on/", { waitUntil: "load" });
await page.waitForTimeout(1800);

const dump = await page.evaluate(
  () =>
    new Promise((resolve) => {
      document.querySelector('button[aria-label="Next slide"]')?.click();
      setTimeout(() => {
        const out = document
          .getAnimations()
          .filter((a) => !/slideContainer/.test(a.effect?.target?.className ?? ""))
          .slice(0, 1)
          .map((a) => {
            const target = a.effect.target;
            const cs = getComputedStyle(target);
            return {
              target: `${target.tagName}.${target.className}`,
              display: cs.display,
              willChange: cs.willChange,
              position: cs.position,
              timing: a.effect.getTiming(),
              firstKeyframes: a.effect.getKeyframes().slice(0, 3),
              lastKeyframe: a.effect.getKeyframes().slice(-1)[0],
              parentFilter: getComputedStyle(target.parentElement).filter,
              parentContain: getComputedStyle(target.parentElement).contain,
            };
          });
        resolve(out);
      }, 600);
    }),
);

console.log(JSON.stringify(dump, null, 2));
await browser.close();
