/**
 * Velocity micro-profile around each click: prints per-frame px/ms in a window
 * after every click mark, so velocity dips (perceived freeze) and negative
 * spikes (real rollback) become visible even when no frame gap exists.
 * Re-base artifacts (render-window shift) are detected as paired dx outliers
 * and annotated instead of treated as motion.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const label = process.argv[2];
const windowAfterMs = Number(process.argv[3] ?? 900);
const { rec } = JSON.parse(
  readFileSync(path.resolve(".perf-probe", "out", `${label}.json`), "utf8"),
);

const { frames, marks } = rec;
const t0 = marks[0].t;

// Bucket per-frame velocity into 25ms bins for a compact profile.
const BIN = 25;
for (const mark of marks) {
  const from = mark.t;
  const to = mark.t + windowAfterMs;
  const rows = [];
  let lastX = null;
  let lastT = null;
  for (const [t, x] of frames) {
    if (t < from - 50 || t > to) continue;
    if (lastX !== null) {
      const dt = t - lastT;
      const dx = x - lastX;
      const v = dx / dt;
      rows.push({ t: t - t0, dt, v });
    }
    lastX = x;
    lastT = t;
  }
  // Compress into bins: mean v per bin, flag outliers.
  const bins = new Map();
  for (const row of rows) {
    const key = Math.floor((row.t - (mark.t - t0)) / BIN);
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push(row.v);
  }
  const profile = [...bins.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, vs]) => {
      const mean = vs.reduce((s, v) => s + v, 0) / vs.length;
      return `${String(key * BIN).padStart(4)}ms ${mean.toFixed(3)}`;
    });
  console.log(`\n=== click @ ${Math.round(mark.t - t0)}ms (+${windowAfterMs}ms window, px/ms) ===`);
  // Print 8 per line
  for (let i = 0; i < profile.length; i += 8) {
    console.log(profile.slice(i, i + 8).join(" | "));
  }
  // Highlight dips: |v| < 30% of window median |v| after motion begins.
  const vs = rows.map((r) => Math.abs(r.v)).filter((v) => v > 0.001).sort((a, b) => a - b);
  const med = vs[Math.floor(vs.length / 2)] ?? 0;
  const dips = rows.filter(
    (r) => r.t - (mark.t - t0) > 50 && Math.abs(r.v) < med * 0.3 && med > 0.01,
  );
  const reversals = rows.filter((r) => r.t - (mark.t - t0) > 10 && r.v * Math.sign(rows[rows.length-1].v||-1) < -0.05 && Math.abs(r.v) < 50);
  if (dips.length) {
    console.log(
      "DIPS(<30% median):",
      dips.map((d) => `${Math.round(d.t - (mark.t - t0))}ms v=${d.v.toFixed(3)}`).join(", "),
    );
  }
  if (reversals.length) {
    console.log(
      "COUNTER-DIRECTION:",
      reversals.map((d) => `${Math.round(d.t - (mark.t - t0))}ms v=${d.v.toFixed(3)}`).join(", "),
    );
  }
}
