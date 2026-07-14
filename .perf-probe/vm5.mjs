import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";
const mp4 = readFileSync(".perf-probe/out/rec3.mp4");
const srv = createServer((req,res)=>{
  if(req.url.startsWith("/v.mp4")){
    const range=req.headers.range;
    if(range){ const m=/bytes=(\d+)-(\d*)/.exec(range); const a=+m[1], b=m[2]?+m[2]:mp4.length-1;
      res.writeHead(206,{"Content-Type":"video/mp4","Accept-Ranges":"bytes","Content-Range":`bytes ${a}-${b}/${mp4.length}`,"Content-Length":b-a+1}); res.end(mp4.subarray(a,b+1)); }
    else { res.writeHead(200,{"Content-Type":"video/mp4","Accept-Ranges":"bytes","Content-Length":mp4.length}); res.end(mp4); }
  } else { res.writeHead(200,{"Content-Type":"text/html"}); res.end('<video id=v src="/v.mp4" muted playsinline></video>'); }
}).listen(4630);

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage();
page.on("console", m => { const t=m.text(); if(!t.startsWith("f ")) console.log("[p]", t); });
await page.goto("http://localhost:4630/");

const out = await page.evaluate(async () => {
  const v = document.getElementById("v");
  if (v.readyState < 2) await new Promise(r => (v.onloadeddata = r));
  const VW = v.videoWidth, VH = v.videoHeight;
  console.log(`video ${VW}x${VH} ${v.duration.toFixed(1)}s`);

  // Crop ONE narrow band straight out of the source frame — the decoder never
  // has to scale the whole 1080p frame, which is what starved the old probe.
  const BW = 300;                       // band width in samples
  const sy = Math.round(VH * 0.35), sh = Math.round(VH * 0.12);
  const c = document.createElement("canvas"); c.width = BW; c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const MAX = 30;

  const band = () => {
    ctx.drawImage(v, 0, sy, VW, sh, 0, 0, BW, 1);   // crop + squash to one row
    const d = ctx.getImageData(0, 0, BW, 1).data;
    const b = new Float32Array(BW);
    for (let x = 0; x < BW; x++) { const i = x*4; b[x] = d[i]*.299 + d[i+1]*.587 + d[i+2]*.114; }
    return b;
  };

  const res = []; let prev = null, n = 0;
  await new Promise(resolve => {
    const guard = setTimeout(() => { console.log("guard @" + n); resolve(); }, 240000);
    const step = (_x, meta) => {
      n++;
      const cur = band();
      if (prev) {
        let best = 0, be = Infinity;
        for (let s = -MAX; s <= MAX; s++) { let e = 0;
          for (let x = MAX; x < BW - MAX; x++) e += Math.abs(cur[x+s] - prev[x]);
          if (e < be) { be = e; best = s; } }
        res.push([+(meta.mediaTime*1000).toFixed(1), best]);
      }
      prev = cur;
      if (v.ended) { clearTimeout(guard); console.log("done, frames=" + n); resolve(); }
      else v.requestVideoFrameCallback(step);
    };
    v.requestVideoFrameCallback(step);
    v.play();
  });
  return res;
});
await browser.close(); srv.close();

const dt = out.length > 1 ? (out[out.length-1][0] - out[0][0]) / (out.length-1) : 0;
console.log(`\nframes: ${out.length}   mean frame interval: ${dt.toFixed(1)}ms  (=> ${(1000/dt).toFixed(0)} fps captured)`);

const rides = []; let cur = null, gap = 0;
for (const [t, dx] of out) {
  if (Math.abs(dx) >= 1) { if (!cur) cur = { start: t, items: [] }; cur.items.push([t, dx]); gap = 0; }
  else if (cur) { cur.items.push([t, dx]); if (++gap > 8) { rides.push(cur); cur = null; gap = 0; } }
}
if (cur) rides.push(cur);

let n = 0;
for (const r of rides) {
  const it = r.items, travel = it.reduce((s, [, d]) => s + Math.abs(d), 0);
  if (it.length < 12 || travel < 40) continue;
  n++;
  console.log(`\n--- RIDE ${n} @${(r.start/1000).toFixed(2)}s   ${it.length} frames, ${travel}px ---`);
  console.log("  strip px/frame: " + it.map(([, d]) => String(Math.abs(d)).padStart(2)).join(" "));
  const st = [];
  for (let i = 2; i < it.length - 2; i++) {
    const nb = (Math.abs(it[i-2][1]) + Math.abs(it[i-1][1]) + Math.abs(it[i+1][1]) + Math.abs(it[i+2][1])) / 4;
    if (nb >= 2.5 && Math.abs(it[i][1]) <= nb * 0.45)
      st.push(`+${(it[i][0]-r.start).toFixed(0)}ms: strip moved ${Math.abs(it[i][1])}px, neighbours ${nb.toFixed(1)}px`);
  }
  console.log(st.length ? "  >>> STRIP STALLED:\n    " + st.join("\n    ") : "  smooth");
}
