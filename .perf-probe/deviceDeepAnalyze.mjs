/**
 * Analyse the deep capture: find the hitch frame(s) per ride, then dump
 * everything the browser was doing in that exact window.
 */
import { readFileSync } from "node:fs";

const trace = JSON.parse(readFileSync(".perf-probe/out/deep-trace.json", "utf8"));
const { pos, touch, press } = JSON.parse(
  readFileSync(".perf-probe/out/deep-pos.json", "utf8"),
);
const events = trace.traceEvents ?? trace;

// --- clock alignment: probe-press exists in BOTH the page and the trace ------
const pressEvent = events.find(
  (e) => e.name === "probe-press" && e.cat?.includes("blink.user_timing"),
);
if (!pressEvent) throw new Error("probe-press missing from trace — cannot align clocks");
// trace ts (µs) <-> page performance.now() (ms)
const traceUsAtPress = pressEvent.ts;
const pageMsAtPress = press;
const pageMsToTraceUs = (ms) => traceUsAtPress + (ms - pageMsAtPress) * 1000;

const procs = {};
const threads = {};
for (const e of events) {
  if (e.name === "process_name") procs[e.pid] = e.args?.name;
  if (e.name === "thread_name") threads[`${e.pid}/${e.tid}`] = e.args?.name;
}

const dedup = (arr, gap) => {
  const out = [];
  for (const x of arr) if (!out.length || x - out[out.length - 1] > gap) out.push(x);
  return out;
};
const starts = dedup(touch.filter(([k]) => k === "start").map(([, t]) => t), 120);
const ends = dedup(touch.filter(([k]) => k === "end").map(([, t]) => t), 120);

console.log(`rAF samples: ${pos.length}, gestures: ${starts.length}\n`);

// --- per ride: find the hitch ------------------------------------------------
const hitches = [];

for (const release of ends) {
  const nextPress = starts.find((s) => s > release + 60) ?? Infinity;
  const win = pos.filter(([t]) => t >= release && t <= Math.min(release + 2200, nextPress));
  if (win.length < 8) continue;

  const xs = win.map(([, x]) => x);
  const ts = win.map(([t]) => t);

  // Trim the settled tail (deck at rest) and any recenter jump.
  const finalX = xs[xs.length - 1];
  let end = xs.length - 1;
  while (end > 0 && Math.abs(xs[end - 1] - finalX) < 0.4) end -= 1;
  if (end < 6) continue;

  const total = xs[end] - xs[0];
  if (Math.abs(total) < 20) continue; // not a real ride

  // Per-frame step + expected step from the local trend (median of neighbours).
  const steps = [];
  for (let i = 1; i <= end; i += 1) {
    const dx = xs[i] - xs[i - 1];
    const dt = ts[i] - ts[i - 1];
    if (Math.abs(dx) > 200) continue; // recenter reset, not motion
    steps.push({ i, at: ts[i], dx: Math.abs(dx), dt, progress: (xs[i] - xs[0]) / total });
  }
  if (steps.length < 8) continue;

  // A hitch = a frame whose travel collapses well below its neighbours
  // (content did not advance) and/or whose dt blew past a vsync.
  const medDt = [...steps.map((s) => s.dt)].sort((a, b) => a - b)[Math.floor(steps.length / 2)];
  let worst = null;
  for (let k = 2; k < steps.length - 2; k += 1) {
    const s = steps[k];
    const around = [steps[k - 2], steps[k - 1], steps[k + 1], steps[k + 2]].map((x) => x.dx);
    const expected = around.reduce((a, b) => a + b, 0) / around.length;
    if (expected < 1.5) continue; // too slow to judge (landing tail)
    const deficit = 1 - s.dx / expected; // 1 = frozen, 0 = on trend
    const lateness = s.dt / medDt;
    const score = Math.max(deficit, (lateness - 1) * 0.8);
    if (score > 0.35 && (!worst || score > worst.score)) {
      worst = { ...s, expected, deficit, lateness, score };
    }
  }

  const rideMs = ts[end] - release;
  if (worst) {
    hitches.push({ release, worst, rideMs, total });
    console.log(
      `RIDE rel@${release.toFixed(0)}  ${Math.abs(total).toFixed(0)}px / ${rideMs.toFixed(0)}ms  ` +
        `-> HITCH at +${(worst.at - release).toFixed(0)}ms  (${(worst.progress * 100).toFixed(0)}% of distance)  ` +
        `moved ${worst.dx.toFixed(1)}px vs expected ${worst.expected.toFixed(1)}px  ` +
        `dt=${worst.dt.toFixed(0)}ms (${worst.lateness.toFixed(1)}x vsync)`,
    );
  } else {
    console.log(
      `RIDE rel@${release.toFixed(0)}  ${Math.abs(total).toFixed(0)}px / ${rideMs.toFixed(0)}ms  -> clean`,
    );
  }
}

if (hitches.length === 0) {
  console.log("\nNo hitch detected in this capture.");
  process.exit(0);
}

// --- consistency: same time, or same fraction of the ride? -------------------
const at = hitches.map((h) => h.worst.at - h.release);
const fr = hitches.map((h) => h.worst.progress);
const stats = (a) => {
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  const sd = Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length);
  return { m, sd };
};
const t = stats(at);
const f = stats(fr);
console.log(
  `\nHITCHES: ${hitches.length}/${ends.length} rides` +
    `\n  time from release : mean ${t.m.toFixed(0)}ms  sd ${t.sd.toFixed(0)}ms` +
    `\n  fraction of ride  : mean ${(f.m * 100).toFixed(0)}%   sd ${(f.sd * 100).toFixed(0)}%` +
    `\n  -> ${f.sd < t.sd / 12 ? "locked to the DISTANCE/curve" : t.sd < 40 ? "locked to TIME" : "no clear lock"}`,
);

// --- what was the browser doing at each hitch? -------------------------------
const BEFORE_MS = 40;
const AFTER_MS = 12;
const NOISE = /^(ThreadControllerImpl::RunTask|RunTask|MessageLoop|TaskGraphRunner|ThreadPool_RunTask|Scheduler|SequenceManager)/;

console.log("\n=== what the browser was doing at each hitch ===");
for (const h of hitches) {
  const from = pageMsToTraceUs(h.worst.at - BEFORE_MS);
  const to = pageMsToTraceUs(h.worst.at + AFTER_MS);
  console.log(
    `\n--- hitch at +${(h.worst.at - h.release).toFixed(0)}ms into the ride (${(h.worst.progress * 100).toFixed(0)}%) ---`,
  );
  const rows = events
    .filter((e) => e.ph === "X" && e.dur >= 1500 && e.ts + e.dur >= from && e.ts <= to)
    .sort((a, b) => b.dur - a.dur)
    .slice(0, 14);
  if (rows.length === 0) {
    console.log("  (no task >1.5ms — the main thread was IDLE: the stall is not JS/commit)");
  }
  for (const e of rows) {
    const where = `${procs[e.pid] ?? e.pid}/${threads[`${e.pid}/${e.tid}`] ?? e.tid}`;
    const rel = (e.ts - pageMsToTraceUs(h.worst.at)) / 1000;
    const name = e.args?.data?.functionName || e.name;
    console.log(
      `  ${rel >= 0 ? "+" : ""}${rel.toFixed(1)}ms  ${(e.dur / 1000).toFixed(1)}ms  [${where}]  ${name}`,
    );
  }
}
