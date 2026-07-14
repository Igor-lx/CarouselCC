/**
 * Every "similar" animation I build by hand composites. The app's do not.
 * No per-frame app work, no class-change effect. So the blocker must be IN the
 * app's actual keyframes/timing — my replicas were close, not exact.
 *
 * Capture the app's REAL dot animation during a ride, then replay those exact
 * keyframes and timing by hand, with no app involved.
 *
 *   - replay composites  -> the keyframes are innocent, the context isn't
 *   - replay main-ticks  -> the blocker is in the values; bisect them
 *
 *   node .perf-probe/deviceDotReplay.mjs
 */
import { chromium } from "playwright-core";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().startsWith("http"));
if (!page) throw new Error("no page found on device");
await page.bringToFront();
await page.goto("http://127.0.0.1:8080/on/", { waitUntil: "load" });
await page.waitForTimeout(1800);

const captured = await page.evaluate(
  () =>
    new Promise((resolve) => {
      document.querySelector('button[aria-label="Next slide"]')?.click();
      setTimeout(() => {
        const dot = document
          .getAnimations()
          .find((a) => /_dot_/.test(String(a.effect?.target?.className ?? "")));
        if (!dot) return resolve(null);
        resolve({
          keyframes: dot.effect.getKeyframes().map((f) => {
            const { computedOffset, easing, composite, offset, ...props } = f;
            return props;
          }),
          timing: dot.effect.getTiming(),
        });
      }, 600);
    }),
);

if (!captured) throw new Error("no dot animation captured");

console.log(`captured ${captured.keyframes.length} keyframes`);
console.log(`timing: ${JSON.stringify(captured.timing)}`);
console.log("\nunique transform values:");
const transforms = [...new Set(captured.keyframes.map((f) => f.transform))];
console.log(`  ${transforms.slice(0, 4).join("  ")} ... ${transforms.slice(-2).join("  ")}`);
console.log("\nkeyframe property sets:");
console.log(`  ${[...new Set(captured.keyframes.map((f) => Object.keys(f).sort().join("+")))].join(" | ")}`);

// --- replay it verbatim, no app involved ------------------------------------
await page.goto("http://127.0.0.1:8080/on/", { waitUntil: "load" });
await page.waitForTimeout(1600);

const result = await page.evaluate(
  (c) =>
    new Promise((resolve) => {
      document.getAnimations().forEach((a) => a.cancel());
      const dots = [...document.querySelectorAll('[class*="_dot_"]')].slice(0, 2);
      dots.forEach((d) =>
        d.animate(c.keyframes, { ...c.timing, duration: 5000 }),
      );
      setTimeout(() => {
        resolve(
          document.getAnimations().map((a) => {
            const cls = String(a.effect?.target?.className ?? "");
            return `${/_dot_/.test(cls) ? "dot" : "?"}:${a.playState}`;
          }),
        );
      }, 500);
    }),
  captured,
);
console.log(`\nreplayed animations live: ${result.join(", ")}`);
console.log("(now check the trace with deviceDotComposite-style measurement)");

await browser.close();
