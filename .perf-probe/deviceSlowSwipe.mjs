/**
 * Measure the swipes that ACTUALLY reproduce the hitch.
 * Captures, on one clock: the real keyframes handed to the compositor (=> the
 * true px/frame speed of the ride) AND every dropped compositor frame.
 * Then: at the moment of each drop, how many px did the deck skip?
 */
import { chromium } from "playwright-core";
const CATS=["devtools.timeline","disabled-by-default-devtools.timeline","disabled-by-default-devtools.timeline.frame","blink.user_timing","cc","viz","benchmark","toplevel"];
const browser=await chromium.connectOverCDP("http://127.0.0.1:9222");
const pages=browser.contexts().flatMap(c=>c.pages());
const page=pages.find(p=>p.url().includes("CarouselCC"))??pages[0];
await page.bringToFront();
await page.goto("https://igor-lx.github.io/CarouselCC/?cb="+Date.now(),{waitUntil:"load"});
await page.waitForTimeout(1500);

const s=await browser.newBrowserCDPSession();
await s.send("Tracing.start",{transferMode:"ReturnAsStream",traceConfig:{recordMode:"recordUntilFull",includedCategories:CATS}});

await page.evaluate(()=>{
  const w=window; w.__k=[]; w.__t=[]; w.__go=false;
  const orig=Element.prototype.animate;
  Element.prototype.animate=function(kf,opts){
    try{ if(this.hasAttribute&&this.hasAttribute("data-carousel-track"))
      w.__k.push({t:performance.now(),dur:opts&&opts.duration,frames:(kf||[]).map(f=>f.transform)});
    }catch{}
    return orig.call(this,kf,opts);
  };
  addEventListener("touchstart",()=>{ if(!w.__go){w.__go=true;performance.clearMarks("probe-press");performance.mark("probe-press");} w.__t.push(["s",performance.now()]); },{capture:true});
  addEventListener("touchend",()=>w.__go&&w.__t.push(["e",performance.now()]),{capture:true});
});

console.log(">>> ARMED — swipe SLOWLY, the way that reproduces the hitch (15s) <<<");
await page.waitForFunction("window.__go===true",null,{timeout:0});
await page.waitForTimeout(15000);
const d=await page.evaluate(()=>({k:window.__k,t:window.__t,press:performance.getEntriesByName("probe-press")[0].startTime}));

const sp=new Promise(r=>s.on("Tracing.tracingComplete",e=>r(e.stream)));
await s.send("Tracing.end"); const st=await sp; let raw="";
for(;;){const c=await s.send("IO.read",{handle:st}); raw+=c.base64Encoded?Buffer.from(c.data,"base64").toString("utf8"):c.data; if(c.eof)break;}
await s.send("IO.close",{handle:st});
await browser.close();

const ev=JSON.parse(raw).traceEvents??[];
const mk=ev.find(e=>e.name==="probe-press"&&e.cat?.includes("blink.user_timing"));
const toMs=us=>d.press+(us-mk.ts)/1000;
const drops=[];
for(const e of ev){
  if(e.name!=="PipelineReporter"||e.ph!=="b")continue;
  const r=e.args?.frame_reporter??e.args?.chrome_frame_reporter;
  if(r?.state&&/DROPPED/.test(r.state)) drops.push(toMs(e.ts));
}
const px=s=>{const m=/translate3d\((-?[\d.]+)px/.exec(s||"");return m?parseFloat(m[1]):NaN;};

console.log(`\nrides: ${d.k.length}   dropped frames in capture: ${drops.length}\n`);
d.k.forEach((a,n)=>{
  const xs=a.frames.map(px).filter(v=>!Number.isNaN(v));
  if(xs.length<3)return;
  const dur=a.dur, dt=dur/(xs.length-1);
  const total=Math.abs(xs[xs.length-1]-xs[0]);
  const steps=[]; for(let i=1;i<xs.length;i++)steps.push(Math.abs(xs[i]-xs[i-1]));
  const peak=Math.max(...steps);
  const avgPxFrame=total/(dur/16.67);
  const peakPxFrame=peak/dt*16.67;
  const t0=a.t, t1=a.t+dur;
  const inRide=drops.filter(x=>x>=t0-30&&x<=t1+60);
  console.log(`--- ride #${n+1}: ${total.toFixed(0)}px / ${dur.toFixed(0)}ms ---`);
  console.log(`    AVG speed: ${avgPxFrame.toFixed(1)} px/frame   PEAK: ${peakPxFrame.toFixed(1)} px/frame`);
  console.log(`    dropped frames in this ride: ${inRide.length}${inRide.length?"  at "+inRide.map(x=>{
    const rel=x-t0; const frac=rel/dur;
    const idx=Math.min(steps.length-1,Math.max(0,Math.floor(frac*steps.length)));
    const skipPx=steps[idx]/dt*16.67;
    return `+${rel.toFixed(0)}ms (${(frac*100).toFixed(0)}% of ride, deck was moving ${skipPx.toFixed(1)} px/frame -> a dropped frame SKIPS that much)`;
  }).join("; "):""}`);
});
