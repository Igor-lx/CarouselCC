import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const mp4 = readFileSync(".perf-probe/out/rec3.mp4");
const HTML = `<!doctype html><meta charset=utf8><video id=v src="/v.mp4" muted playsinline></video>`;
const server = createServer((req, res) => {
  if (req.url.startsWith("/v.mp4")) {
    res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": mp4.length });
    res.end(mp4);
  } else {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(HTML);
  }
}).listen(4602);

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage();
page.on("console", m => console.log("  [page]", m.text()));
await page.goto("http://localhost:4602/");

const disp = await page.evaluate(async () => {
  const v = document.getElementById("v");
  await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error("load failed")); });
  console.log(`video ${v.videoWidth}x${v.videoHeight} ${v.duration.toFixed(1)}s`);
  const W = 200, H = Math.round((v.videoHeight / v.videoWidth) * W);
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const y0 = Math.round(H * 0.28), y1 = Math.round(H * 0.44), rows = y1 - y0, MAX = 26;
  const band = () => {
    ctx.drawImage(v, 0, 0, W, H);
    const d = ctx.getImageData(0, y0, W, rows).data;
    const b = new Float32Array(W);
    for (let x = 0; x < W; x++) { let s = 0;
      for (let y = 0; y < rows; y++) { const i = (y*W + x) * 4; s += d[i]*.299 + d[i+1]*.587 + d[i+2]*.114; }
      b[x] = s / rows; }
    return b;
  };
  const out = []; let prev = null;
  await new Promise((resolve) => {
    const guard = setTimeout(resolve, 120000);
    const step = (_n, meta) => {
      const cur = band();
      if (prev) {
        let best = 0, bestErr = Infinity;
        for (let s = -MAX; s <= MAX; s++) { let e = 0;
          for (let x = MAX; x < W - MAX; x++) e += Math.abs(cur[x+s] - prev[x]);
          if (e < bestErr) { bestErr = e; best = s; } }
        out.push([Math.round(meta.mediaTime * 1000), best]);
      }
      prev = cur;
      if (v.ended) { clearTimeout(guard); resolve(); } else v.requestVideoFrameCallback(step);
    };
    v.requestVideoFrameCallback(step);
    v.play().catch(e => console.log("play " + e.message));
  });
  return out;
});
await browser.close(); server.close();

console.log(`\nframes: ${disp.length}`);
const rides = []; let cur = null, gap = 0;
for (const [t, dx] of disp) {
  if (Math.abs(dx) >= 1) { if (!cur) cur = { start: t, items: [] }; cur.items.push([t, dx]); gap = 0; }
  else if (cur) { cur.items.push([t, dx]); if (++gap > 5) { rides.push(cur); cur = null; gap = 0; } }
}
if (cur) rides.push(cur);
for (const r of rides) {
  const it = r.items, travel = it.reduce((s, [, d]) => s + Math.abs(d), 0);
  if (it.length < 10 || travel < 30) continue;
  console.log(`\n--- RIDE @${(r.start/1000).toFixed(2)}s  ${it.length} frames, ${travel}px on screen ---`);
  console.log("  px/frame: " + it.map(([, d]) => String(Math.abs(d)).padStart(2)).join(" "));
  const st = [];
  for (let i = 2; i < it.length - 2; i++) {
    const nb = (Math.abs(it[i-2][1]) + Math.abs(it[i-1][1]) + Math.abs(it[i+1][1]) + Math.abs(it[i+2][1])) / 4;
    if (nb >= 3 && Math.abs(it[i][1]) <= nb * 0.4)
      st.push(`+${it[i][0]-r.start}ms: moved ${Math.abs(it[i][1])}px while neighbours ~${nb.toFixed(1)}px`);
  }
  console.log(st.length ? "  >>> STALL ON SCREEN:\n    " + st.join("\n    ") : "  clean");
}
