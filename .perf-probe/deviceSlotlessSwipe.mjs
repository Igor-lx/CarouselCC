import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
const RECORD=20000;
const CATS=["devtools.timeline","disabled-by-default-devtools.timeline","disabled-by-default-devtools.timeline.frame","blink","blink.user_timing","cc","gpu","viz","benchmark","toplevel","v8","v8.execute"];
const browser=await chromium.connectOverCDP("http://127.0.0.1:9222");
const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes("CarouselCC"));
await page.bringToFront();
await page.waitForTimeout(400);
const s=await browser.newBrowserCDPSession();
await s.send("Tracing.start",{transferMode:"ReturnAsStream",traceConfig:{recordMode:"recordUntilFull",includedCategories:CATS}});
await page.evaluate(()=>{
  const w=window; w.__d={touch:[],go:false};
  addEventListener("touchstart",()=>{ if(!w.__d.go){w.__d.go=true; performance.clearMarks("probe-press"); performance.mark("probe-press");} w.__d.touch.push(["start",performance.now()]); },{capture:true});
  addEventListener("touchend",()=>w.__d.go&&w.__d.touch.push(["end",performance.now()]),{capture:true});
});
console.log(">>> ARMED — swipe now (20s from your first touch) <<<");
await page.waitForFunction("window.__d.go===true",null,{timeout:0});
console.log(">>> recording 20s <<<");
await page.waitForTimeout(RECORD);
const data=await page.evaluate(()=>({touch:window.__d.touch, press:performance.getEntriesByName("probe-press")[0].startTime}));
const sp=new Promise(r=>s.on("Tracing.tracingComplete",e=>r(e.stream)));
await s.send("Tracing.end"); const st=await sp; let raw="";
for(;;){const c=await s.send("IO.read",{handle:st}); raw+=c.base64Encoded?Buffer.from(c.data,"base64").toString("utf8"):c.data; if(c.eof)break;}
await s.send("IO.close",{handle:st});
await browser.close();
writeFileSync(".perf-probe/out/slotless-swipe-trace.json", raw);
writeFileSync(".perf-probe/out/slotless-swipe-pos.json", JSON.stringify({...data, pos:[]}));
console.log("touch events:", data.touch.length, " trace", (raw.length/1e6).toFixed(1),"MB");
