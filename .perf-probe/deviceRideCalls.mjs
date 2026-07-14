/**
 * Every animation of the app, recreated by hand, composites for free (x7).
 * The app's own ride costs x453. So it is not WHAT is animated — it is what
 * the app DOES while it animates.
 *
 * Count it: how many animate() calls, style reads (getComputedStyle,
 * getBoundingClientRect) and animation cancels happen during ONE ride, and on
 * which elements. Anything happening ~60x is the culprit.
 *
 *   node .perf-probe/deviceRideCalls.mjs
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

const report = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const tally = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
      const animateCalls = new Map();
      const cancels = new Map();
      const computedReads = new Map();
      const rectReads = new Map();
      const styleWrites = new Map();

      const label = (el) => {
        if (!el || !el.tagName) return "(none)";
        const cls = String(el.className ?? "");
        if (/slideContainer/.test(cls)) return "TRACK";
        if (/_dot_/.test(cls)) return "dot";
        if (/_slide_/.test(cls)) return "slide";
        return `${el.tagName}.${cls.slice(0, 18)}`;
      };

      const originalAnimate = Element.prototype.animate;
      Element.prototype.animate = function patched(k, o) {
        tally(animateCalls, label(this));
        return originalAnimate.call(this, k, o);
      };

      const originalCancel = Animation.prototype.cancel;
      Animation.prototype.cancel = function patched() {
        tally(cancels, label(this.effect?.target));
        return originalCancel.call(this);
      };

      const originalComputed = window.getComputedStyle;
      window.getComputedStyle = function patched(el, pe) {
        tally(computedReads, label(el));
        return originalComputed.call(window, el, pe);
      };

      const originalRect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function patched() {
        tally(rectReads, label(this));
        return originalRect.call(this);
      };

      // Inline style writes on animating elements.
      const styleDescriptor = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        "style",
      );
      Object.defineProperty(HTMLElement.prototype, "style", {
        get() {
          const declaration = styleDescriptor.get.call(this);
          const element = this;
          return new Proxy(declaration, {
            set(target, prop, value) {
              tally(styleWrites, `${label(element)}.${String(prop)}`);
              target[prop] = value;
              return true;
            },
            get(target, prop) {
              const v = target[prop];
              return typeof v === "function" ? v.bind(target) : v;
            },
          });
        },
        configurable: true,
      });

      // Class / attribute changes on an element with a running composited
      // animation force Blink to re-evaluate it — and can drop it to the main
      // thread for the rest of the ride. React moves the active-dot class.
      const classChanges = new Map();
      const attrChanges = new Map();

      const classDescriptor = Object.getOwnPropertyDescriptor(
        Element.prototype,
        "className",
      );
      Object.defineProperty(Element.prototype, "className", {
        get() {
          return classDescriptor.get.call(this);
        },
        set(value) {
          tally(classChanges, label(this));
          classDescriptor.set.call(this, value);
        },
        configurable: true,
      });

      const originalSetAttribute = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function patched(name, value) {
        tally(attrChanges, `${label(this)}[${name}]`);
        return originalSetAttribute.call(this, name, value);
      };

      const observer = new MutationObserver((records) => {
        for (const r of records) {
          if (r.type === "attributes") {
            tally(attrChanges, `MUT ${label(r.target)}[${r.attributeName}]`);
          }
        }
      });
      observer.observe(document.body, {
        attributes: true,
        subtree: true,
        attributeFilter: ["class", "style"],
      });

      document.querySelector('button[aria-label="Next slide"]')?.click();

      setTimeout(() => {
        const top = (m) =>
          [...m].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} x${n}`);
        resolve({
          animate: top(animateCalls),
          cancel: top(cancels),
          getComputedStyle: top(computedReads),
          getBoundingClientRect: top(rectReads),
          styleWrites: top(styleWrites),
          classChanges: top(classChanges),
          attrChanges: top(attrChanges),
        });
      }, 1900);
    }),
);

console.log("During ONE ride (~1.9s ≈ 114 frames):\n");
for (const [key, list] of Object.entries(report)) {
  console.log(`  ${key}:`);
  if (list.length === 0) console.log("    (none)");
  list.forEach((l) => console.log(`    ${l}`));
}

await browser.close();
