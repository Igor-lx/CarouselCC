/**
 * Flaw in the previous suppressor: it created the animation with EMPTY
 * keyframes. That animation still RUNS in Blink's timeline — it animates
 * nothing, but it is still a live main-thread animation, and Blink schedules a
 * main frame for it every frame. So "suppressed" phases still had 2-3 running
 * animations, and every phase came out identical. The dots were never actually
 * ruled out.
 *
 * This kills them for real: cancel the animation AND neuter the two things the
 * bindings use to resurrect it (`startTime` assignment revives a cancelled
 * animation; so does `play()`).
 *
 *   A) as shipped
 *   B) dots truly dead — only the track animates
 *
 * Self-check prints the live animations, so a silent failure cannot pass again.
 *
 *   node .perf-probe/deviceDotsKill.mjs
 */
import { chromium } from "playwright-core";

const CLICKS = 4;
const GAP_MS = 2300;
const RIDE_MS = 1900;

const CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "blink.user_timing",
  "blink",
  "cc",
];

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().startsWith("http"));
if (!page) throw new Error("no page found on device");
await page.bringToFront();

const runPhase = async (label, killDots) => {
  await page.goto("http://127.0.0.1:8080/on/", { waitUntil: "load" });
  await page.waitForTimeout(1800);

  if (killDots) {
    await page.evaluate(() => {
      const original = Element.prototype.animate;
      Element.prototype.animate = function patched(keyframes, options) {
        const animation = original.call(this, keyframes, options);
        if (/slideContainer/.test(String(this.className ?? ""))) return animation;

        animation.cancel();
        // The bindings revive a cancelled animation by assigning startTime (and
        // some call play()). Make both inert so the animation stays idle.
        Object.defineProperty(animation, "startTime", {
          get: () => null,
          set: () => {},
          configurable: true,
        });
        Object.defineProperty(animation, "play", {
          value: () => {},
          configurable: true,
        });
        return animation;
      };
    });
  }

  const session = await browser.newBrowserCDPSession();
  await session.send("Tracing.start", {
    transferMode: "ReturnAsStream",
    traceConfig: { recordMode: "recordUntilFull", includedCategories: CATEGORIES },
  });

  const rides = [];
  let live = null;
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

    if (i === 0) {
      await page.waitForTimeout(600);
      live = await page.evaluate(() =>
        document.getAnimations().map((a) => {
          const cls = String(a.effect?.target?.className ?? "");
          const kind = /slideContainer/.test(cls) ? "track" : "dot";
          return `${kind}:${a.playState}`;
        }),
      );
      await page.waitForTimeout(GAP_MS - 600);
      continue;
    }
    await page.waitForTimeout(GAP_MS);
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
  if (!mark) throw new Error(`${label}: no probe-press mark`);
  const toPageMs = (us) => press + (us - mark.ts) / 1000;
  const inRide = (ms) => rides.some((s) => ms >= s && ms <= s + RIDE_MS);

  let beginMainFrame = 0;
  let beginMainMs = 0;
  let paint = 0;
  let layerize = 0;
  let mainAnim = 0;
  let compAnim = 0;
  let frames = 0;

  for (const e of events) {
    if (e.name === "PipelineReporter" && e.ph === "b") {
      const r = e.args?.frame_reporter ?? e.args?.chrome_frame_reporter;
      if (!r?.state || !inRide(toPageMs(e.ts))) continue;
      frames += 1;
      if (r.has_main_animation) mainAnim += 1;
      if (r.has_compositor_animation) compAnim += 1;
      continue;
    }
    if (e.ph !== "X" || !e.dur || !inRide(toPageMs(e.ts))) continue;
    if (e.name === "ProxyMain::BeginMainFrame") {
      beginMainFrame += 1;
      beginMainMs += e.dur / 1000;
    }
    if (e.name === "Blink.Paint.UpdateTime") paint += 1;
    if (e.name === "Layerize") layerize += 1;
  }

  console.log(`\n--- ${label} ---`);
  console.log(`  live animations mid-ride: ${live.join(", ") || "(none)"}`);
  console.log(
    `  BeginMainFrame x${beginMainFrame} (${beginMainMs.toFixed(0)}ms)   Paint x${paint}   Layerize x${layerize}`,
  );
  console.log(
    `  main_anim ${mainAnim}/${frames}   compositor_anim ${compAnim}`,
  );
  return beginMainFrame;
};

console.log("Do the dot animations drive the main frame? (this time, really killed)");
const a = await runPhase("A) as shipped", false);
const b = await runPhase("B) dots truly dead", true);
console.log(`\n=> BeginMainFrame ${a} -> ${b}`);

await browser.close();
