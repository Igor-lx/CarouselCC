import { chromium } from "playwright-core";
const CLICKS=7, GAP=2600, RIDE=2000;
const CATS=["devtools.timeline","disabled-by-default-devtools.timeline","disabled-by-default-devtools.timeline.frame","blink","blink.user_timing","cc","gpu","viz","benchmark","toplevel","v8","v8.execute"];
const browser=await chromium.connectOverCDP("http://127.0.0.1:9222");
const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes("CarouselCC"));
await page.bringToFront();
await page.goto("https://igor-lx.github.io/CarouselCC/?cb="+Date.now(),{waitUntil:"load"});
await page.waitForTimeout(1800);
console.log("bundle:", await page.evaluate(()=>document.querySelector('script[src]')?.src.split('/').pop()));
console.log("slots present?", await page.evaluate(()=>({
  pagination: !!document.querySelector('[class*="pagination"],[class*="container_PW"]'),
  controls: !!document.querySelector('button[aria-label="Next slide"]'),
})));

const s=await browser.newBrowserCDPSession();
await s.send("Tracing.start",{transferMode:"ReturnAsStream",traceConfig:{recordMode:"recordUntilFull",includedCategories:CATS}});
const rides=[];
for(let i=0;i<CLICKS;i++){
  const t=await page.evaluate((first)=>{
    if(first){performance.clearMarks("probe-press");performance.mark("probe-press");}
    // the App's own next button (Controls slot is absent in this build)
    const btns=[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='›');
    btns[0]?.click();
    return performance.now();
  }, i===0);
  rides.push(t); await page.waitForTimeout(GAP);
}
const press=await page.evaluate(()=>performance.getEntriesByName("probe-press")[0].startTime);
const sp=new Promise(r=>s.on("Tracing.tracingComplete",e=>r(e.stream)));
await s.send("Tracing.end"); const st=await sp; let raw="";
for(;;){const c=await s.send("IO.read",{handle:st}); raw+=c.base64Encoded?Buffer.from(c.data,"base64").toString("utf8"):c.data; if(c.eof)break;}
await s.send("IO.close",{handle:st});
await browser.close();
const fs=await import("node:fs");
fs.writeFileSync(".perf-probe/out/slotless-click-trace.json", raw);
fs.writeFileSync(".perf-probe/out/slotless-click-pos.json", JSON.stringify({touch:rides.map(t=>["end",t]), press, pos:[]}));
console.log("click rides:", rides.length, " trace", (raw.length/1e6).toFixed(1),"MB");
