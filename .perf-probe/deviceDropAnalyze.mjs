/**
 * The eye sees what the COMPOSITOR presented, not what the main thread modelled.
 * A DROPPED compositor frame = the screen repeated the previous image for one
 * vsync = exactly one micro-hitch. Find them, place them in the ride, and show
 * Chrome's own reason plus what the main thread was doing.
 */
import { readFileSync } from "node:fs";

const trace = JSON.parse(readFileSync(".perf-probe/out/deep-trace.json", "utf8"));
const { touch, press } = JSON.parse(
  readFileSync(".perf-probe/out/deep-pos.json", "utf8"),
);
const events = trace.traceEvents ?? trace;

const pressEvent = events.find(
  (e) => e.name === "probe-press" && e.cat?.includes("blink.user_timing"),
);
const traceUsAtPress = pressEvent.ts;
const traceUsToPageMs = (us) => press + (us - traceUsAtPress) / 1000;

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
const ends = dedup(touch.filter(([k]) => k === "end").map(([, t]) => t), 120);
const starts = dedup(touch.filter(([k]) => k === "start").map(([, t]) => t), 120);

// --- every PipelineReporter, with its state --------------------------------
const reporters = events
  .filter((e) => e.name === "PipelineReporter" && e.ph === "b")
  .map((e) => ({
    ms: traceUsToPageMs(e.ts),
    r: e.args?.frame_reporter ?? e.args?.chrome_frame_reporter ?? {},
  }))
  .filter((x) => x.r.state);

const dropped = reporters.filter((x) => /DROPPED/.test(x.r.state));
const presented = reporters.filter((x) => /PRESENTED/.test(x.r.state));

console.log(
  `reporters: ${reporters.length} | presented ${presented.length} | DROPPED ${dropped.length}\n`,
);

// --- place each dropped frame inside its ride -------------------------------
console.log("=== dropped frames, per ride ===");
let inRide = 0;
for (const release of ends) {
  const nextPress = starts.find((s) => s > release + 60) ?? Infinity;
  const rideEnd = Math.min(release + 2200, nextPress);
  const drops = dropped.filter((d) => d.ms >= release - 30 && d.ms <= rideEnd);
  inRide += drops.length;
  const detail = drops
    .map((d) => {
      const flags = [];
      if (d.r.has_missing_content) flags.push("missing-content");
      if (d.r.checkerboarded_needs_raster) flags.push("needs-raster");
      if (d.r.has_high_latency) flags.push("high-latency");
      if (d.r.has_main_animation) flags.push("main-anim");
      if (d.r.has_compositor_animation) flags.push("compositor-anim");
      if (d.r.affects_smoothness) flags.push("AFFECTS-SMOOTHNESS");
      return `+${(d.ms - release).toFixed(0)}ms [${flags.join(",") || "-"}]`;
    })
    .join("  ");
  console.log(
    `ride rel@${release.toFixed(0)}: ${drops.length} dropped   ${detail}`,
  );
}
console.log(`\ndropped frames landing inside rides: ${inRide}/${dropped.length}`);

// --- Chrome's own breakdown of a dropped frame ------------------------------
const sample = dropped.find((d) => ends.some((e) => d.ms > e && d.ms < e + 2000));
if (sample) {
  console.log("\n=== full reporter payload of one in-ride dropped frame ===");
  console.log(JSON.stringify(sample.r, null, 1).slice(0, 1200));
}

// --- what runs on the MAIN thread during a ride? ----------------------------
// Nothing should: the ride is a compositor animation. Anything expensive here
// can push BeginMainFrame past the vsync and make the compositor drop a frame.
const ride = ends[1] ?? ends[0];
const rideTo = ride + 1800;
console.log(`\n=== main-thread work during ONE ride (rel@${ride.toFixed(0)}) ===`);
const mainTasks = events
  .filter((e) => {
    if (e.ph !== "X" || !e.dur) return false;
    const th = threads[`${e.pid}/${e.tid}`];
    if (th !== "CrRendererMain") return false;
    const ms = traceUsToPageMs(e.ts);
    return ms >= ride && ms <= rideTo && e.dur >= 2000;
  })
  .map((e) => ({
    at: traceUsToPageMs(e.ts) - ride,
    dur: e.dur / 1000,
    name: e.name,
  }));

const byName = {};
for (const t of mainTasks) {
  byName[t.name] = byName[t.name] ?? { n: 0, total: 0, max: 0 };
  byName[t.name].n += 1;
  byName[t.name].total += t.dur;
  byName[t.name].max = Math.max(byName[t.name].max, t.dur);
}
for (const [name, s] of Object.entries(byName).sort((a, b) => b[1].total - a[1].total).slice(0, 14)) {
  console.log(
    `  ${name.padEnd(42)} x${String(s.n).padStart(3)}  total ${s.total.toFixed(0)}ms  max ${s.max.toFixed(1)}ms`,
  );
}
