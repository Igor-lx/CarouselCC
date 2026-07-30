/**
 * The first-ride probe: does the deck's one-time warm-up land INSIDE the user's
 * first interaction?
 *
 * It clicks "next" with NO settling pause, because that is what a person does,
 * and compares ride 0 against ride 4 (same page, second circle, everything
 * already warm). The two should be indistinguishable. See ./README.md.
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
const BASELINE_RIDE = 4; // second circle at visibleSlides=3 / pageCount=4

/** Ride 0 may cost no more than this multiple of the warm baseline. */
const TOLERANCE = 2;

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
// A weak tablet's link, which is where this was reported.
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
for (let attempt = 0; attempt < 300; attempt += 1) {
  if (await cdp.evaluate("!!document.querySelector('[data-carousel-track]')")) break;
  await sleep(100);
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

/** One page of slides — the most a single ride can newly put on screen. */
const visibleSlides = await cdp.evaluate(
  `Number(getComputedStyle(document.querySelector('[data-carousel-root]'))
     .getPropertyValue('--visible-slides')) || 1`,
);

const probe = await cdp
  .evaluate(
    "JSON.stringify({ frames: window.__perf.frames, spans: window.__perf.spans, lcp: window.__perf.lcp })",
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
    perRide.set(ride, { layout: 0, commit: 0, decode: 0, droppedFrames: 0, worstGapMs: 0 });
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

// ---- report -----------------------------------------------------------------
const rides = [...perRide.keys()].filter((ride) => ride >= 0).sort((a, b) => a - b);
const pad = (value, width) => String(value).padStart(width);

console.log(`\nfirst-ride probe — CPU x${CPU_THROTTLE}, Fast-3G, no warm-up pause\n`);
console.log("ride | dropped | worst gap |  layout |  commit |  decode");
for (const ride of rides) {
  const s = perRide.get(ride);
  console.log(
    `${pad(ride, 4)} | ${pad(s.droppedFrames, 7)} | ${pad(`${s.worstGapMs}ms`, 9)} | ` +
      `${pad(s.layout, 7)} | ${pad(s.commit, 7)} | ${pad(s.decode, 7)}`,
  );
}

const first = perRide.get(0);
const baseline = perRide.get(BASELINE_RIDE);
const failures = [];

if (!baseline) {
  failures.push(`no baseline ride ${BASELINE_RIDE} — run more clicks`);
} else {
  // Gated on what a person actually experiences, and on the one signal that
  // says warm-up work ran inside the ride. `layout` and `commit` are printed
  // for context but NOT gated: at this bucketing they are per-frame compositor
  // work (~150/190 on every ride alike), so they discriminate nothing.
  const limit = Math.max(TOLERANCE * baseline.droppedFrames, baseline.droppedFrames + 2);
  if (first.droppedFrames > limit) {
    failures.push(
      `droppedFrames: ride 0 = ${first.droppedFrames}, ` +
        `baseline ride ${BASELINE_RIDE} = ${baseline.droppedFrames}, limit ${limit}`,
    );
  }
  /**
   * The first ride may pay for the page it is RIDING TO and nothing else.
   *
   * Those images are fetched at click time, because the buffer deliberately
   * waits for the deck to be still before mounting itself — and on a weak link
   * the user clicks before it ever gets the chance. Demanding zero here would
   * be demanding that the buffer race the user, which was measured and is
   * worse: granting reach earlier pushes the band's own images past the click.
   *
   * Anything above one page means the BUFFER decoded inside the ride, which is
   * the defect.
   */
  if (first.decode > visibleSlides) {
    failures.push(
      `decode: ride 0 decoded ${first.decode} images, at most ${visibleSlides} ` +
        `(one page — what the ride puts on screen) may land inside the ride`,
    );
  }
}

console.log(`\nLCP ${probe.lcp}ms — warming earlier must not push this out`);
console.log(
  `baseline = ride ${BASELINE_RIDE} (second circle, everything already warm)\n` +
    `tolerance = ${TOLERANCE}x baseline; decode allowance = ${visibleSlides} ` +
    `(one page, the slides this ride puts on screen)\n`,
);
if (failures.length === 0) {
  console.log("PASS — the first ride costs no more than a warm one.");
} else {
  console.log("FAIL — the warm-up is still landing inside the first ride:");
  for (const failure of failures) console.log(`  - ${failure}`);
}

cdp.close();
chrome.kill();
server.kill();
process.exit(failures.length === 0 ? 0 : 1);
