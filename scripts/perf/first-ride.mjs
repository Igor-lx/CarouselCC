/**
 * The first-ride probe: does the deck's one-time warm-up land INSIDE the user's
 * first interaction?
 *
 * It clicks "next" with NO settling pause, because that is what a person does,
 * and compares the FIRST circle against the second, which is the shape the
 * report had: "the first pass stutters, after that it is smooth". Judging one
 * ride misses half of it — the warm-up spills across the opening rides, and
 * which of them it lands in depends on how the load races the click.
 * See ./README.md.
 *
 * Not a unit test and not run by `vitest`: it measures the BROWSER (commit,
 * layout, raster, image decode), so it needs a real Chrome and its own command.
 */
import { spawn } from "node:child_process";
import { launchChrome, connect, sleep } from "./cdp.mjs";

const PORT = 4173;
const URL_ = `http://localhost:${PORT}/CarouselCC/`;
const CPU_THROTTLE = Number(process.env.PERF_CPU ?? 6);
const CLICKS = Number(process.env.PERF_CLICKS ?? 8);
const RIDE_MS = Number(process.env.PERF_RIDE_MS ?? 3200);


const startPreview = async () => {
  const server = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "preview", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore" },
  );
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(URL_)).ok) return server;
    } catch {
      /* not listening yet */
    }
    await sleep(200);
  }
  throw new Error("vite preview did not come up");
};

const server = await startPreview();
const chrome = await launchChrome();
const cdp = await connect();

const events = [];
cdp.on("Tracing.dataCollected", (payload) => {
  for (const event of payload.value) events.push(event);
});
let tracingDone;
const traceComplete = new Promise((resolve) => {
  tracingDone = resolve;
});
cdp.on("Tracing.tracingComplete", () => tracingDone());

await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Network.enable");
await cdp.send("Emulation.setDeviceMetricsOverride", {
  width: 1280,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });
/** A weak tablet's link, which is where this was reported. */
await cdp.send("Network.emulateNetworkConditions", {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
});

await cdp.send("Tracing.start", {
  transferMode: "ReportEvents",
  traceConfig: {
    recordMode: "recordAsMuchAsPossible",
    includedCategories: [
      "devtools.timeline",
      "disabled-by-default-devtools.timeline",
      "disabled-by-default-devtools.timeline.frame",
      "blink",
      "cc",
    ],
  },
});

await cdp.send("Page.navigate", { url: URL_ });
// Poll tightly: a person clicks the moment the deck appears, and the defect
// needs the click to beat the band finishing its load.
for (let attempt = 0; attempt < 900; attempt += 1) {
  if (await cdp.evaluate("!!document.querySelector('[data-carousel-track]')")) break;
  await sleep(20);
}

/**
 * Only the MOVING part of each ride counts. The deck settles well before the
 * next click, and warm-up that happens in that quiet tail is exactly what we
 * want — charging it to the ride would make every fix unmeasurable.
 *
 * The root already publishes the phase as `data-moving`, so the page reports
 * its own movement rather than the probe guessing from timings.
 */
await cdp.evaluate(`(() => {
  window.__perf = { frames: [], spans: [], lcp: 0 };
  window.__ride = -1;

  // Guard rail: warming the buffer earlier must not push the first paint out.
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__perf.lcp = Math.round(entry.startTime);
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });

  const root = document.querySelector('[data-carousel-root]');
  const isMoving = () => root.getAttribute('data-moving') === 'true';
  let wasMoving = isMoving();

  // The defect, measured directly rather than through its symptoms: mounting
  // the buffer is an <img> per buffered slide in one commit, and it must never
  // happen while the deck is animating.
  window.__perf.mounted = [];
  const track = document.querySelector('[data-carousel-track]');
  new MutationObserver((records) => {
    let added = 0;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeName === 'IMG') added += 1;
        else if (node.querySelectorAll) added += node.querySelectorAll('img').length;
      }
    }
    if (added > 0) {
      // Ride and phase are stamped ON the event. The buffer's mount lands in
      // the same commit that flips the moving attribute, so resolving it
      // against a ride WINDOW built from that attribute misses it by a hair.
      window.__perf.mounted.push({
        added,
        moving: isMoving(),
        ride: window.__ride,
      });
    }
  }).observe(track, { childList: true, subtree: true });

  new MutationObserver(() => {
    const moving = isMoving();
    if (moving === wasMoving) return;
    wasMoving = moving;
    console.timeStamp((moving ? 'MOVE_ON:' : 'MOVE_OFF:') + window.__ride);
    window.__perf.spans.push({ t: performance.now(), moving, ride: window.__ride });
  }).observe(root, { attributes: true, attributeFilter: ['data-moving'] });

  let last = performance.now();
  const tick = (now) => {
    window.__perf.frames.push({ t: now, gap: now - last });
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`);

const clickNext = (ride) => `((n) => {
  const button = [...document.querySelectorAll("button")]
    .find((element) => element.textContent.trim() === "\\u203a");
  if (!button) return "no-button";
  window.__ride = n;
  button.click();
  return "ok";
})(${ride})`;

// NO warm-up pause: landing the cost inside ride 0 is the defect under test.
for (let ride = 0; ride < CLICKS; ride += 1) {
  const outcome = await cdp.evaluate(clickNext(ride));
  if (outcome !== "ok") throw new Error(`click failed: ${outcome}`);
  await sleep(RIDE_MS);
}


const probe = await cdp
  .evaluate(
    `JSON.stringify({
       frames: window.__perf.frames,
       spans: window.__perf.spans,
       mounted: window.__perf.mounted,
       lcp: window.__perf.lcp,
     })`,
  )
  .then(JSON.parse);
await cdp.send("Tracing.end");
await traceComplete;

// ---- the moving windows, in both clocks ------------------------------------
/** Pair MOVE_ON/MOVE_OFF into one span per ride, on whichever clock. */
const toSpans = (marks) => {
  const spans = [];
  let open = null;
  for (const mark of marks) {
    if (mark.moving) open = mark;
    else if (open && open.ride === mark.ride) {
      spans.push({ ride: mark.ride, from: open.t, to: mark.t });
      open = null;
    }
  }
  if (open) spans.push({ ride: open.ride, from: open.t, to: Infinity });
  return spans;
};

const traceMarks = [];
for (const event of events) {
  const message = String(event.args?.data?.message ?? event.args?.data?.name ?? "");
  if (event.name !== "TimeStamp") continue;
  if (message.startsWith("MOVE_ON:")) {
    traceMarks.push({ moving: true, ride: Number(message.slice(8)), t: event.ts / 1000 });
  } else if (message.startsWith("MOVE_OFF:")) {
    traceMarks.push({ moving: false, ride: Number(message.slice(9)), t: event.ts / 1000 });
  }
}
traceMarks.sort((a, b) => a.t - b.t);

const traceSpans = toSpans(traceMarks);
const pageSpans = toSpans(probe.spans);

const rideOfSpan = (spans, t) => spans.find((s) => t >= s.from && t <= s.to)?.ride ?? -1;

const BUCKETS = {
  layout: /^Layout$|^UpdateLayoutTree$/,
  commit: /^Commit$/,
  // One event per image decoded, not per decode sub-task.
  decode: /^Decode LazyPixelRef$/,
};

const perRide = new Map();
const of = (ride) => {
  if (!perRide.has(ride)) {
    perRide.set(ride, {
      layout: 0,
      commit: 0,
      decode: 0,
      mountedWhileMoving: 0,
      droppedFrames: 0,
      worstGapMs: 0,
    });
  }
  return perRide.get(ride);
};

for (const event of events) {
  if (event.ph !== "X" && event.ph !== "I") continue;
  const ride = rideOfSpan(traceSpans, event.ts / 1000);
  if (ride < 0) continue; // outside every moving window — not this ride's cost
  for (const [bucket, pattern] of Object.entries(BUCKETS)) {
    if (pattern.test(event.name)) of(ride)[bucket] += 1;
  }
}

for (const frame of probe.frames) {
  const ride = rideOfSpan(pageSpans, frame.t);
  if (ride < 0) continue;
  const stats = of(ride);
  if (frame.gap > 34) stats.droppedFrames += 1;
  stats.worstGapMs = Math.max(stats.worstGapMs, Math.round(frame.gap));
}

for (const mount of probe.mounted) {
  if (!mount.moving || mount.ride < 0) continue;
  of(mount.ride).mountedWhileMoving += mount.added;
}

// ---- report -----------------------------------------------------------------
const rides = [...perRide.keys()].filter((ride) => ride >= 0).sort((a, b) => a - b);
const pad = (value, width) => String(value).padStart(width);

console.log(`\nfirst-ride probe — CPU x${CPU_THROTTLE}, Fast-3G, no warm-up pause\n`);
console.log("ride | dropped | worst gap | <img> mid-ride |  decode |  layout |  commit");
for (const ride of rides) {
  const s = perRide.get(ride);
  console.log(
    `${pad(ride, 4)} | ${pad(s.droppedFrames, 7)} | ${pad(`${s.worstGapMs}ms`, 9)} | ` +
      `${pad(s.mountedWhileMoving, 14)} | ${pad(s.decode, 7)} | ` +
      `${pad(s.layout, 7)} | ${pad(s.commit, 7)}`,
  );
}

/**
 * First circle against second, not ride 0 against ride 4.
 *
 * The report was "the first pass stutters, after that it is smooth", and the
 * measurements bear that shape out: the warm-up does not sit in one ride, it
 * spills across the opening ones — its mount may land in a settle gap while
 * its fetches and decodes still run through the next ride. Judging ride 0
 * alone misses half of it, and which half depends on how the load races the
 * click.
 */
const CIRCLE = Math.floor(CLICKS / 2);
const sumOver = (from, to, metric) => {
  let total = 0;
  for (let ride = from; ride < to; ride += 1) total += perRide.get(ride)?.[metric] ?? 0;
  return total;
};

const firstCircle = {
  droppedFrames: sumOver(0, CIRCLE, "droppedFrames"),
  decode: sumOver(0, CIRCLE, "decode"),
};
const secondCircle = {
  droppedFrames: sumOver(CIRCLE, 2 * CIRCLE, "droppedFrames"),
  decode: sumOver(CIRCLE, 2 * CIRCLE, "decode"),
};


/**
 * This REPORTS; it deliberately does not pass or fail.
 *
 * The defect is a race. The buffer used to mount as soon as the band finished
 * loading, and whether that lands inside a ride depends on how the load times
 * against the click. Both outcomes were observed on unfixed code: on a fast
 * link the band finishes about 250ms in, squarely inside the 2.5s ride; on the
 * slow link configured above it finishes after the ride is already over. A gate
 * that green-lights unfixed code half the time is worse than no gate, so there
 * is no gate here.
 *
 * What a run gives you is the timeline — WHEN the buffer mounted relative to the
 * rides, and what the opening circle cost against a warm one. The invariant
 * itself, that the buffer may only open while the deck is still, is asserted
 * where it can be asserted deterministically:
 * slides/tests/useSlideFetchReach.test.tsx.
 */
const mountedWhileMoving = probe.mounted
  .filter((mount) => mount.moving)
  .reduce((sum, mount) => sum + mount.added, 0);

console.log("\nwhen images were mounted into the track:");
for (const mount of probe.mounted) {
  const where = mount.ride < 0 ? "before the first click" : `ride ${mount.ride}`;
  const phase = mount.moving ? "WHILE MOVING" : "at rest";
  console.log(`  +${String(mount.added).padStart(2)} <img>  ${where.padEnd(22)} ${phase}`);
}

console.log(
  `\nfirst circle : ${firstCircle.droppedFrames} dropped, ${firstCircle.decode} decodes` +
    `\nsecond circle: ${secondCircle.droppedFrames} dropped, ${secondCircle.decode} decodes` +
    `\n<img> mounted while moving: ${mountedWhileMoving}` +
    `\nLCP ${probe.lcp}ms`,
);
console.log(
  "\nA healthy run mounts the buffer once, at rest, and the two circles cost the\n" +
    "same but for the deck's one-time decodes in the first.\n",
);

cdp.close();
chrome.kill();
server.kill();
process.exit(0);
