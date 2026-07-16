/**
 * Frame-by-frame analysis of freeze.mp4 (see freezeRecord.mjs).
 *
 * Per video frame:
 *   1. corner box (fixed, css 6,6..50,50): white == a resize fired (toolbar);
 *   2. find the MAGENTA content line by scanning a center column: its Y
 *      anchors the content in screen space (scroll + toolbar shift);
 *   3. sample a 1-px band mid-strip (content-relative), estimate horizontal
 *      shift vs the previous frame by 1D cross-correlation.
 *
 * Output: a timeline of [t, dx, marker] and detected stalls (|dx| < 1.5 device
 * px for >= 2 consecutive frames while the ride should be moving).
 *
 *   node .perf-probe/freezeAnalyze.mjs
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const mp4 = readFileSync(".perf-probe/out/freeze.mp4");
const meta = JSON.parse(readFileSync(".perf-probe/out/freeze-meta.json", "utf8"));

const srv = createServer((req, res) => {
  if (req.url.startsWith("/v.mp4")) {
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const a = +m[1];
      const b = m[2] ? +m[2] : mp4.length - 1;
      res.writeHead(206, {
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${a}-${b}/${mp4.length}`,
        "Content-Length": b - a + 1,
      });
      res.end(mp4.subarray(a, b + 1));
    } else {
      res.writeHead(200, {
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
        "Content-Length": mp4.length,
      });
      res.end(mp4);
    }
  } else {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('<video id="v" src="/v.mp4" muted playsinline></video>');
  }
}).listen(4631);

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage();
await page.goto("http://localhost:4631/");

const frames = await page.evaluate(async (meta) => {
  const v = document.getElementById("v");
  if (v.readyState < 2) await new Promise((r) => (v.onloadeddata = r));

  const DPR = meta.dpr;
  const VW = v.videoWidth;
  const scale = VW / (meta.cssW * DPR); // screenrecord may downscale

  const toVid = (cssPx) => cssPx * DPR * scale;

  // Crop canvases.
  const corner = new OffscreenCanvas(8, 8);
  const cornerCtx = corner.getContext("2d", { willReadFrequently: true });
  const COL_W = 4;
  const colH = v.videoHeight;
  const column = new OffscreenCanvas(COL_W, colH);
  const columnCtx = column.getContext("2d", { willReadFrequently: true });
  const BAND_W = Math.floor(VW / 2);
  const band = new OffscreenCanvas(BAND_W, 1);
  const bandCtx = band.getContext("2d", { willReadFrequently: true });

  const out = [];
  let prevBand = null;

  const processFrame = (mediaTime) => {
    // 1. corner flash?
    cornerCtx.drawImage(
      v,
      toVid(10), toVid(10), toVid(36), toVid(36),
      0, 0, 8, 8,
    );
    const c = cornerCtx.getImageData(0, 0, 8, 8).data;
    let lum = 0;
    for (let i = 0; i < c.length; i += 4) lum += c[i] + c[i + 1] + c[i + 2];
    const marker = lum / (c.length / 4) / 3 > 140;

    // 2. find the magenta line in a center column.
    columnCtx.drawImage(
      v,
      Math.floor(VW * 0.55), 0, COL_W, v.videoHeight,
      0, 0, COL_W, colH,
    );
    const col = columnCtx.getImageData(0, 0, COL_W, colH).data;
    let lineY = -1;
    for (let y = 0; y < colH; y += 1) {
      const i = (y * COL_W + 1) * 4;
      const r = col[i], g = col[i + 1], b = col[i + 2];
      if (r > 150 && b > 150 && g < 110) { lineY = y; break; }
    }

    // 3. strip band, content-anchored.
    let dx = null;
    if (lineY >= 0) {
      const bandY = Math.min(
        v.videoHeight - 2,
        lineY + Math.round(toVid(meta.stripTopFromLine)),
      );
      bandCtx.drawImage(v, 0, bandY, VW, 2, 0, 0, BAND_W, 1);
      const cur = bandCtx.getImageData(0, 0, BAND_W, 1).data;
      const gray = new Float32Array(BAND_W);
      for (let x = 0; x < BAND_W; x += 1) {
        const i = x * 4;
        gray[x] = cur[i] * 0.3 + cur[i + 1] * 0.6 + cur[i + 2] * 0.1;
      }
      if (prevBand) {
        const R = 34; // search radius in band samples (band is 1/2 scale)
        let best = 0, bestErr = Infinity;
        for (let s = -R; s <= R; s += 1) {
          let err = 0, n = 0;
          for (let x = R; x < BAND_W - R; x += 4) {
            const d = gray[x] - prevBand[x - s];
            err += d * d;
            n += 1;
          }
          err /= n;
          if (err < bestErr) { bestErr = err; best = s; }
        }
        // band is at 1/2 video scale -> device px = *2 (approx, includes scale)
        dx = best * 2;
      }
      prevBand = gray;
    } else {
      prevBand = null;
    }

    out.push([Math.round(mediaTime * 1000), dx, marker ? 1 : 0, lineY]);
  };

  v.playbackRate = 0.4;
  await v.play();
  await new Promise((resolve) => {
    const step = (_, meta2) => {
      processFrame(meta2.mediaTime);
      if (v.ended) resolve();
      else v.requestVideoFrameCallback(step);
    };
    v.requestVideoFrameCallback(step);
    v.onended = resolve;
  });
  return out;
}, meta);

await browser.close();
srv.close();

writeFileSync(".perf-probe/out/freeze-frames.json", JSON.stringify(frames));
// ---- report ------------------------------------------------------------------
console.log(`frames: ${frames.length}`);
let lastMarker = false;
const stalls = [];
let run = null;

for (const [t, dx, marker] of frames) {
  if (marker && !lastMarker) console.log(`  ${t}ms  RESIZE FLASH`);
  lastMarker = Boolean(marker);

  if (dx === null) { run = null; continue; }
  if (Math.abs(dx) < 1.5) {
    if (!run) run = { from: t, frames: 0 };
    run.frames += 1;
    run.to = t;
  } else {
    if (run && run.frames >= 2) stalls.push(run);
    run = null;
  }
}
if (run && run.frames >= 2) stalls.push(run);

console.log("\nper-frame dx (device px), '.' = no data:");
let line = "";
for (const [t, dx] of frames) {
  line += dx === null ? "  . " : String(Math.round(dx)).padStart(3) + " ";
  if (line.length > 100) { console.log("  " + line); line = ""; }
}
if (line) console.log("  " + line);

console.log("\nstill-runs of >=2 frames (candidate stalls, incl. legit idle):");
for (const s of stalls) {
  console.log(`  ${s.from}ms .. ${s.to}ms  (${s.frames} frames)`);
}
