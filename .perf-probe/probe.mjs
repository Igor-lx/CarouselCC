/**
 * Motion-start jank probe.
 *
 * Loads the production preview build, injects a per-rAF recorder that samples
 * the carousel track's computed translateX (and whether a WAAPI animation
 * currently owns the track), drives click scenarios, then analyses the series
 * for stalls (frame gaps), reversals (movement against travel direction) and
 * catch-up jumps. Optionally captures a CDP screencast around the first click
 * so the painted frames can be inspected visually.
 *
 * Usage: node .perf-probe/probe.mjs [--screencast]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE_URL = "http://localhost:4173/CarouselCC/";
const OUT_DIR = path.resolve(".perf-probe", "out");
const WANT_SCREENCAST = process.argv.includes("--screencast");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? null;

mkdirSync(OUT_DIR, { recursive: true });

/** In-page recorder: rAF loop sampling the track transform. */
const RECORDER = () => {
  const track = document.querySelector("[data-carousel-track]");
  const rec = { frames: [], marks: [] };
  window.__rec = rec;
  window.__mark = (name) => rec.marks.push({ t: performance.now(), name });
  const tick = (t) => {
    const m = new DOMMatrixReadOnly(getComputedStyle(track).transform);
    rec.frames.push([t, m.m41, track.getAnimations().length]);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

/** In-page click on the "next" navigation zone, marked in the same task. */
const CLICK_NEXT = () => {
  window.__mark("click");
  document.querySelector('button[aria-label="Next slide"]').click();
};

const analyse = (label, rec) => {
  const { frames, marks } = rec;
  if (frames.length < 10) return { label, error: "too few frames" };
  const t0 = marks.length > 0 ? marks[0].t : frames[0][0];
  const rel = (t) => Math.round(t - t0);

  // Travel direction: sign of the total displacement across the recording.
  const total = frames[frames.length - 1][1] - frames[0][1];
  const dir = Math.sign(total) || -1;

  const dts = [];
  const anomalies = [];
  let animSwitches = [];
  for (let i = 1; i < frames.length; i += 1) {
    const [t, x, anims] = frames[i];
    const [pt, px, panims] = frames[i - 1];
    const dt = t - pt;
    const dx = x - px;
    dts.push(dt);
    if (anims !== panims) animSwitches.push(`${rel(t)}ms:${panims}->${anims}`);
    const moving = Math.abs(dx) > 0.01 || Math.abs(dt) > 0;
    if (dt > 45) {
      anomalies.push({ t: rel(t), type: "STALL", dt: Math.round(dt), dx: +dx.toFixed(1) });
    }
    if (dir * dx < -0.75) {
      anomalies.push({ t: rel(t), type: "REVERSE", dt: Math.round(dt), dx: +dx.toFixed(2) });
    }
  }
  //

  const sorted = [...dts].sort((a, b) => a - b);
  const medianDt = sorted[Math.floor(sorted.length / 2)];
  // Catch-up jumps: |dx| far above the local norm while in motion.
  const absDx = frames.slice(1).map((f, i) => Math.abs(f[1] - frames[i][1]));
  const movingDx = absDx.filter((v) => v > 0.05).sort((a, b) => a - b);
  const medianMove = movingDx[Math.floor(movingDx.length / 2)] ?? 0;
  for (let i = 1; i < frames.length; i += 1) {
    const dx = Math.abs(frames[i][1] - frames[i - 1][1]);
    if (medianMove > 0 && dx > Math.max(14, 4 * medianMove)) {
      anomalies.push({
        t: rel(frames[i][0]),
        type: "JUMP",
        dt: Math.round(frames[i][0] - frames[i - 1][0]),
        dx: +(frames[i][1] - frames[i - 1][1]).toFixed(1),
      });
    }
  }
  anomalies.sort((a, b) => a.t - b.t);

  return {
    label,
    frames: frames.length,
    spanMs: Math.round(frames[frames.length - 1][0] - frames[0][0]),
    medianDtMs: +medianDt.toFixed(1),
    medianMovePx: +medianMove.toFixed(2),
    clicksAt: marks.map((m) => rel(m.t)),
    animOwnership: animSwitches.join(" "),
    anomalies,
  };
};

async function runScenario(browser, { label, viewport, cpuRate, clicks, recordMs, screencast }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  if (cpuRate > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-carousel-track]");
  await page.waitForTimeout(2500); // settle: images decoded, idle predecode done

  const shots = [];
  if (screencast) {
    cdp.on("Page.screencastFrame", async (ev) => {
      shots.push({ ts: ev.metadata.timestamp * 1000, data: ev.data });
      try {
        await cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId });
      } catch {}
    });
    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: Number(process.env.SC_QUALITY ?? 60),
      maxWidth: Number(process.env.SC_WIDTH ?? 900),
      maxHeight: 600,
      everyNthFrame: 1,
    });
  }

  await page.evaluate(RECORDER);
  for (let i = 0; i < clicks.length; i += 1) {
    if (i === 0) await page.waitForTimeout(200);
    else await page.waitForTimeout(clicks[i] - clicks[i - 1]);
    await page.evaluate(CLICK_NEXT);
  }
  await page.waitForTimeout(recordMs);

  if (screencast) {
    try {
      await cdp.send("Page.stopScreencast");
    } catch {}
  }

  const rec = await page.evaluate(() => window.__rec);
  const result = analyse(label, rec);
  writeFileSync(
    path.join(OUT_DIR, `${label}.json`),
    JSON.stringify({ result, rec }, null, 1),
  );

  if (screencast && shots.length > 0) {
    const dir = path.join(OUT_DIR, `frames-${label}`);
    mkdirSync(dir, { recursive: true });
    // Save frames; name them by wall-clock ms relative to the first shot.
    const t0 = shots[0].ts;
    for (const shot of shots) {
      const stamp = String(Math.round(shot.ts - t0)).padStart(6, "0");
      writeFileSync(path.join(dir, `f${stamp}.jpg`), Buffer.from(shot.data, "base64"));
    }
    result.screencastFrames = shots.length;
  }

  await context.close();
  return result;
}

const DESKTOP = { width: 1400, height: 900 }; // visibleSlidesNr = 3
const MOBILE_LAND = { width: 800, height: 400 }; // compact landscape -> 2 visible

const scenarios = [
  { label: "desktop-single", viewport: DESKTOP, cpuRate: 1, clicks: [0], recordMs: 5000 },
  { label: "desktop-repeat", viewport: DESKTOP, cpuRate: 1, clicks: [0, 300, 600, 900], recordMs: 5500 },
  { label: "desktop-repeat-cpu6", viewport: DESKTOP, cpuRate: 6, clicks: [0, 300, 600, 900], recordMs: 5500 },
  { label: "mland-single-cpu6", viewport: MOBILE_LAND, cpuRate: 6, clicks: [0], recordMs: 5000 },
  { label: "mland-repeat-cpu6", viewport: MOBILE_LAND, cpuRate: 6, clicks: [0, 300, 600, 900], recordMs: 5500 },
];

const browser = await chromium.launch({
  channel: "msedge",
  headless: process.env.HEADED !== "1",
});
for (const scenario of scenarios) {
  if (ONLY && !scenario.label.includes(ONLY)) continue;
  const result = await runScenario(browser, { ...scenario, screencast: WANT_SCREENCAST });
  console.log(JSON.stringify(result, null, 1));
}
await browser.close();
