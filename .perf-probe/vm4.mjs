import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";
const mp4 = readFileSync(".perf-probe/out/rec3.mp4");
const HTML = `<!doctype html><video id=v src="/v.mp4" muted playsinline></video>`;
const server = createServer((req,res)=>{
  if(req.url.startsWith("/v.mp4")){res.writeHead(200,{"Content-Type":"video/mp4","Content-Length":mp4.length});res.end(mp4);}
  else{res.writeHead(200,{"Content-Type":"text/html"});res.end(HTML);}
}).listen(4620);
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage();
page.on("console", m => console.log("[p]", m.text()));
page.on("pageerror", e => console.log("[ERR]", e.message));
await page.goto("http://localhost:4620/");
const disp = await page.evaluate(async () => {
  const v = document.getElementById("v");
  if (v.readyState < 2) await new Promise((r,j)=>{ v.onloadeddata=r; v.onerror=()=>j(new Error("video load failed")); });
  console.log(`loaded ${v.videoWidth}x${v.videoHeight} ${v.duration.toFixed(1)}s`);
  const W=160, H=Math.round(v.videoHeight/v.videoWidth*W);
  const c=document.createElement("canvas"); c.width=W; c.height=H;
  const ctx=c.getContext("2d",{willReadFrequently:true});
  const y0=Math.round(H*0.28), y1=Math.round(H*0.44), rows=y1-y0, MAX=22;
  const band=()=>{ ctx.drawImage(v,0,0,W,H);
    const d=ctx.getImageData(0,y0,W,rows).data, b=new Float32Array(W);
    for(let x=0;x<W;x++){let s=0;for(let y=0;y<rows;y++){const i=(y*W+x)*4;s+=d[i]*.299+d[i+1]*.587+d[i+2]*.114;}b[x]=s/rows;}
    return b; };
  const out=[]; let prev=null, n=0;
  await new Promise((resolve)=>{
    const guard=setTimeout(()=>{console.log("GUARD hit at frame "+n);resolve();},100000);
    const step=(_x,meta)=>{
      n++; if(n%100===0) console.log("frame "+n+" @"+meta.mediaTime.toFixed(1)+"s");
      const cur=band();
      if(prev){ let best=0,be=Infinity;
        for(let s=-MAX;s<=MAX;s++){let e=0;for(let x=MAX;x<W-MAX;x++)e+=Math.abs(cur[x+s]-prev[x]); if(e<be){be=e;best=s;}}
        out.push([Math.round(meta.mediaTime*1000),best]); }
      prev=cur;
      if(v.ended){clearTimeout(guard);console.log("ended at "+n);resolve();} else v.requestVideoFrameCallback(step);
    };
    v.requestVideoFrameCallback(step);
    v.playbackRate=3;
    v.play().catch(e=>console.log("play err "+e.message));
  });
  return out;
});
await browser.close(); server.close();
console.log(`\nframes: ${disp.length}`);
const rides=[]; let cur=null,gap=0;
for(const [t,dx] of disp){
  if(Math.abs(dx)>=1){ if(!cur)cur={start:t,items:[]}; cur.items.push([t,dx]); gap=0; }
  else if(cur){ cur.items.push([t,dx]); if(++gap>5){rides.push(cur);cur=null;gap=0;} }
}
if(cur)rides.push(cur);
for(const r of rides){
  const it=r.items, travel=it.reduce((s,[,d])=>s+Math.abs(d),0);
  if(it.length<10||travel<25) continue;
  console.log(`\n--- RIDE @${(r.start/1000).toFixed(2)}s  ${it.length} frames, ${travel}px ---`);
  console.log("  px/frame: "+it.map(([,d])=>String(Math.abs(d)).padStart(2)).join(" "));
  const st=[];
  for(let i=2;i<it.length-2;i++){
    const nb=(Math.abs(it[i-2][1])+Math.abs(it[i-1][1])+Math.abs(it[i+1][1])+Math.abs(it[i+2][1]))/4;
    if(nb>=2.5 && Math.abs(it[i][1])<=nb*0.45)
      st.push(`+${it[i][0]-r.start}ms: strip moved ${Math.abs(it[i][1])}px, but ${nb.toFixed(1)}px on the frames around it`);
  }
  console.log(st.length?"  >>> STRIP STALLED:\n    "+st.join("\n    "):"  smooth");
}
