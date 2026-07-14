import { readFileSync } from "node:fs";

const load=(t,p)=>{
  const trace=JSON.parse(readFileSync(t,"utf8"));
  const {touch,press}=JSON.parse(readFileSync(p,"utf8"));
  const ev=trace.traceEvents??trace;
  const mk=ev.find(e=>e.name==="probe-press"&&e.cat?.includes("blink.user_timing"));
  const toMs=us=>press+(us-mk.ts)/1000;
  const dd=(a,g)=>{const o=[];for(const x of a)if(!o.length||x-o[o.length-1]>g)o.push(x);return o;};
  const ends=dd(touch.filter(([k])=>k==="end").map(([,t])=>t),150);
  const starts=dd(touch.filter(([k])=>k==="start").map(([,t])=>t),150);
  return {ev,toMs,ends,starts};
};

const report=(label,file,pos)=>{
  const {ev,toMs,ends,starts}=load(file,pos);
  const th={},pr={};
  for(const e of ev){ if(e.name==="thread_name")th[e.pid+"/"+e.tid]=e.args?.name; if(e.name==="process_name")pr[e.pid]=e.args?.name; }
  console.log(`\n########## ${label}  (${ends.length} rides) ##########`);

  // per-ride dropped frames
  const drops=[];
  for(const e of ev){
    if(e.name!=="PipelineReporter"||e.ph!=="b")continue;
    const r=e.args?.frame_reporter??e.args?.chrome_frame_reporter;
    if(!r?.state||!/DROPPED/.test(r.state))continue;
    drops.push({ms:toMs(e.ts),r});
  }
  let inRide=0;
  for(const rel of ends){
    const nxt=starts.find(s=>s>rel+80)??rel+2200;
    const to=Math.min(rel+2200,nxt);
    const d=drops.filter(x=>x.ms>=rel+40&&x.ms<=to);
    inRide+=d.length;
    const det=d.map(x=>{
      const f=[];
      if(x.r.has_main_animation)f.push("main-anim");
      if(x.r.has_compositor_animation)f.push("comp-anim");
      if(x.r.has_missing_content)f.push("MISSING-CONTENT");
      if(x.r.checkerboarded_needs_raster)f.push("NEEDS-RASTER");
      return `+${(x.ms-rel).toFixed(0)}ms[${f.join(",")}]`;
    }).join(" ");
    console.log(`  ride +0..${(to-rel).toFixed(0)}ms : ${d.length} dropped  ${det}`);
  }
  console.log(`  => dropped INSIDE rides: ${inRide}`);

  // main-thread work inside rides
  const agg={};
  for(const e of ev){
    if(e.ph!=="X"||!e.dur||e.dur<1000)continue;
    if(th[e.pid+"/"+e.tid]!=="CrRendererMain")continue;
    const ms=toMs(e.ts);
    if(!ends.some(r=>ms>=r+40&&ms<=r+2000))continue;
    agg[e.name]=agg[e.name]??{n:0,t:0,max:0};
    agg[e.name].n++; agg[e.name].t+=e.dur/1000; agg[e.name].max=Math.max(agg[e.name].max,e.dur/1000);
  }
  console.log(`  --- main-thread tasks >1ms inside rides ---`);
  const rows=Object.entries(agg).sort((a,b)=>b[1].t-a[1].t).slice(0,12);
  if(!rows.length) console.log("    (none)");
  for(const [n,s] of rows) console.log(`    ${n.padEnd(46)} x${String(s.n).padStart(3)}  total ${s.t.toFixed(0)}ms  max ${s.max.toFixed(1)}ms`);

  // worker-thread decode inside rides
  let dec=0,decMs=0;
  for(const e of ev){
    if(e.ph!=="X"||!e.dur)continue;
    if(!/DecodeImage|ImageDecodeTask|decodeToYUV/.test(e.name))continue;
    const ms=toMs(e.ts);
    if(!ends.some(r=>ms>=r-100&&ms<=r+2000))continue;
    if(e.name==="GpuImageDecodeCache::DecodeImage"){dec++;decMs+=e.dur/1000;}
  }
  console.log(`  --- image decodes inside rides: ${dec} (${decMs.toFixed(0)}ms total) ---`);
};

report("SWIPE  (slotless)",".perf-probe/out/slotless-swipe-trace.json",".perf-probe/out/slotless-swipe-pos.json");
report("BUTTON (slotless)",".perf-probe/out/slotless-click-trace.json",".perf-probe/out/slotless-click-pos.json");
