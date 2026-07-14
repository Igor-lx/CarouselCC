import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const mp4 = readFileSync(".perf-probe/out/rec.mp4");
const server = createServer((_, res) => {
  res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": mp4.length });
  res.end(mp4);
}).listen(4599);

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage();
await page.setContent(`<video id="v" src="http://localhost:4599/rec.mp4" muted playsinline></video>`);

const disp = await page.evaluate(async () => {
  const v = document.getElementById("v");
  await new Promise((r) => (v.onloadedmetadata = r));
  const W = 240;
  const H = Math.round((v.videoHeight / v.videoWidth) * W);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const y0 = Math.round(H * 0.30), y1 = Math.round(H * 0.44), rows = y1 - y0;
  const MAX = 30;

  const band = () => {
    ctx.drawImage(v, 0, 0, W, H);
    const d = ctx.getImageData(0, y0, W, rows).data;
    const b = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let y = 0; y < rows; y++) {
        const i = (y * W + x) * 4;
        s += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      }
      b[x] = s / rows;
    }
    return b;
  };

  const out = [];
  let prev = null;
  await new Promise((resolve) => {
    const deadline = setTimeout(resolve, 60000);
    const step = (_n, meta) => {
      const cur = band();
      if (prev) {
        let best = 0, bestErr = Infinity;
        for (let s = -MAX; s <= MAX; s++) {
          let err = 0;
          for (let x = MAX; x < W - MAX; x++) err += Math.abs(cur[x + s] - prev[x]);
          if (err < bestErr) { bestErr = err; best = s; }
        }
        out.push([Math.round(meta.mediaTime * 1000), best]);
      }
      prev = cur;
      if (!v.ended) v.requestVideoFrameCallback(step);
      else { clearTimeout(deadline); resolve(); }
    };
    v.requestVideoFrameCallback(step);
    v.playbackRate = 2;
    v.play();
  });
  return out;
});
await browser.close();
server.close();

console.log(`frames analysed: ${disp.length}\n`);
const rides = [];
let cur = null, gap = 0;
for (const [t, dx] of disp) {
  if (Math.abs(dx) >= 1) { if (!cur) { cur = { start: t, items: [] }; } cur.items.push([t, dx]); gap = 0; }
  else if (cur) { cur.items.push([t, dx]); if (++gap > 5) { rides.push(cur); cur = null; gap = 0; } }
}
if (cur) rides.push(cur);

for (const r of rides) {
  const it = r.items;
  const travel = it.reduce((s, [, d]) => s + Math.abs(d), 0);
  if (it.length < 12 || travel < 40) continue;
  console.log(`--- RIDE @${(r.start / 1000).toFixed(2)}s   ${it.length} frames, ${travel}px ---`);
  console.log("  px/frame: " + it.map(([, d]) => String(Math.abs(d)).padStart(2)).join(" "));
  const stalls = [];
  for (let i = 2; i < it.length - 2; i++) {
    const nb = (Math.abs(it[i-2][1]) + Math.abs(it[i-1][1]) + Math.abs(it[i+1][1]) + Math.abs(it[i+2][1])) / 4;
    if (nb >= 3 && Math.abs(it[i][1]) <= nb * 0.34)
      stalls.push(`+${it[i][0] - r.start}ms: moved ${Math.abs(it[i][1])}px while neighbours moved ~${nb.toFixed(1)}px`);
  }
  console.log(stalls.length ? "  >>> STALLED FRAMES:\n    " + stalls.join("\n    ") : "  clean");
}
