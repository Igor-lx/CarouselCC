/**
 * 8 of the ~9 smoothness-affecting drops carry `has_main_animation` — so a
 * MAIN-THREAD animation is still alive at the start of a step, and it is not
 * the dot fade (that one composites now).
 *
 * Earlier inventories sampled 600 ms into the ride, by which time a short CSS
 * transition would already be over. Sample the FIRST frames instead, and list
 * every effect — including CSSTransition — with its type, target and properties.
 *
 *   node .perf-probe/deviceStartEffects.mjs
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
await page.waitForTimeout(2200);

const report = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const snapshots = [];

      const inventory = () =>
        document.getAnimations().map((a) => {
          const target = a.effect?.target;
          const cls = String(target?.className ?? "");
          const name =
            /slideContainer/.test(cls)
              ? "TRACK"
              : /_dot/.test(cls)
                ? "dot"
                : /_slide/.test(cls)
                  ? "slide"
                  : `${target?.tagName ?? "?"}.${cls.slice(0, 20)}`;
          const props = [
            ...new Set(
              (a.effect?.getKeyframes?.() ?? []).flatMap((f) =>
                Object.keys(f).filter(
                  (k) => !["offset", "computedOffset", "easing", "composite"].includes(k),
                ),
              ),
            ),
          ];
          return `${a.constructor.name}[${a.transitionProperty ?? props.join(",") ?? "?"}] on ${name}`;
        });

      document.querySelector('button[aria-label="Next slide"]')?.click();

      const at = [0, 1, 2, 5, 10, 30];
      let frame = 0;
      const tick = () => {
        if (at.includes(frame)) snapshots.push([frame, inventory()]);
        frame += 1;
        if (frame > 31) {
          resolve(snapshots);
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }),
);

console.log("effects alive, by frame after the click:\n");
for (const [frame, list] of report) {
  console.log(`  frame ${String(frame).padStart(2)}:`);
  if (list.length === 0) console.log("    (none)");
  for (const item of list) console.log(`    ${item}`);
}

await browser.close();
