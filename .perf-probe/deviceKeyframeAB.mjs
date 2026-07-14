/**
 * The dots' WAAPI animations are NOT composited (they cost a full style recalc
 * every frame). The clip is innocent. So the blocker must be in the KEYFRAMES
 * themselves. Replace the widget's animations with synthetic ones that vary one
 * factor at a time, and measure the per-frame style-recalc cost.
 *
 *   transform-only / opacity-only / with scale / without scale / few vs many
 */
import { chromium } from "playwright-core";

const CLICKS = 5;
const GAP_MS = 2400;
const RIDE_MS = 1900;

const CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "blink",
  "blink.user_timing",
  "cc",
  "toplevel",
];

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().includes("CarouselCC"));
if (!page) throw new Error("page not found");
await page.bringToFront();

// `variant` runs INSIDE the page, right after each ride starts: it cancels the
// widget's own dot animations and (optionally) starts synthetic ones.
const runPhase = async (label, variant) => {
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1600);

  const session = await browser.newBrowserCDPSession();
  await session.send("Tracing.start", {
    transferMode: "ReturnAsStream",
    traceConfig: { recordMode: "recordUntilFull", includedCategories: CATEGORIES },
  });

  const rides = [];
  for (let i = 0; i < CLICKS; i += 1) {
    const t = await page.evaluate((first) => {
      if (first) {
        performance.clearMarks("probe-press");
        performance.mark("probe-press");
      }
      document.querySelector('button[aria-label="Next slide"]')?.click();
      return performance.now();
    }, i === 0);
    rides.push(t);
    await page.waitForTimeout(50);
    if (variant) await page.evaluate(variant);
    await page.waitForTimeout(GAP_MS - 50);
  }
  const press = await page.evaluate(
    () => performance.getEntriesByName("probe-press")[0].startTime,
  );

  const streamPromise = new Promise((r) =>
    session.on("Tracing.tracingComplete", (e) => r(e.stream)),
  );
  await session.send("Tracing.end");
  const stream = await streamPromise;
  let raw = "";
  for (;;) {
    const c = await session.send("IO.read", { handle: stream });
    raw += c.base64Encoded ? Buffer.from(c.data, "base64").toString("utf8") : c.data;
    if (c.eof) break;
  }
  await session.send("IO.close", { handle: stream });

  const events = JSON.parse(raw).traceEvents ?? [];
  const mark = events.find(
    (e) => e.name === "probe-press" && e.cat?.includes("blink.user_timing"),
  );
  const toPageMs = (us) => press + (us - mark.ts) / 1000;
  const inRide = (ms) => rides.some((s) => ms >= s + 120 && ms <= s + RIDE_MS);

  let n = 0;
  let ms = 0;
  for (const e of events) {
    if (e.ph !== "X" || !e.dur) continue;
    if (e.name !== "Document::recalcStyle" || !inRide(toPageMs(e.ts))) continue;
    n += 1;
    ms += e.dur / 1000;
  }
  console.log(
    `${label.padEnd(40)} recalc x${String(n).padStart(3)} = ${ms.toFixed(0).padStart(4)}ms  (${(ms / Math.max(1, n)).toFixed(2)}ms per frame)`,
  );
};

// Helper injected into every variant: kill the widget's own animations.
const KILL = `
  const dots = [...document.querySelectorAll('[class*="dot_PW"], [class*="activeDot_PW"]')];
  document.getAnimations().forEach((a) => {
    const el = a.effect && a.effect.target;
    if (el && dots.includes(el)) a.cancel();
  });
`;

const synth = (keyframesExpr) => `() => {
  ${KILL}
  dots.forEach((el, i) => {
    el.animate(${keyframesExpr}, { duration: 1800, fill: 'both' });
  });
}`;

console.log("What in the dot keyframes blocks compositing?\n");

await runPhase("A) widget's own animations", null);
await runPhase("B) cancelled, none (floor)", new Function(`return () => { ${KILL} }`)());

await runPhase(
  "C) transform translate only, 2 keyframes",
  new Function(
    `return ${synth(
      "[{transform:'translate3d(0px,0,0)'},{transform:'translate3d(60px,0,0)'}]",
    )}`,
  )(),
);

await runPhase(
  "D) transform translate+scale, 2 keyframes",
  new Function(
    `return ${synth(
      "[{transform:'translate3d(0px,0,0) scale(1)'},{transform:'translate3d(60px,0,0) scale(0.6)'}]",
    )}`,
  )(),
);

await runPhase(
  "E) transform + OPACITY, 2 keyframes",
  new Function(
    `return ${synth(
      "[{transform:'translate3d(0px,0,0) scale(1)',opacity:1},{transform:'translate3d(60px,0,0) scale(0.6)',opacity:0.3}]",
    )}`,
  )(),
);

await runPhase(
  "F) transform + opacity, 40 keyframes",
  new Function(
    `return ${synth(
      "Array.from({length:40},(_,k)=>({transform:'translate3d('+(k*1.5)+'px,0,0) scale('+(1-k*0.01)+')',opacity:1-k*0.015}))",
    )}`,
  )(),
);

await browser.close();
