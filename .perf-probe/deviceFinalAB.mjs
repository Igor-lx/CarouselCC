import { chromium } from "playwright-core";
const CLICKS=6, GAP=2400, RIDE=1900;
const CATS=["devtools.timeline","disabled-by-default-devtools.timeline","blink","blink.user_timing","cc","toplevel"];
const browser=await chromium.connectOverCDP("http://127.0.0.1:9222");
const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes("CarouselCC"));
await page.bringToFront();

const run=async(label,variant)=>{
  await page.reload({waitUntil:"load"}); await page.waitForTimeout(1600);
  const s=await browser.newBrowserCDPSession();
  await s.send("Tracing.start",{transferMode:"ReturnAsStream",traceConfig:{recordMode:"recordUntilFull",includedCategories:CATS}});
  const rides=[];
  for(let i=0;i<CLICKS;i++){
    const t=await page.evaluate((first)=>{ if(first){performance.clearMarks("probe-press");performance.mark("probe-press");}
      document.querySelector('button[aria-label="Next slide"]')?.click(); return performance.now(); }, i===0);
    rides.push(t); await page.waitForTimeout(50);
    if(variant) await page.evaluate(variant);
    await page.waitForTimeout(GAP-50);
  }
  const press=await page.evaluate(()=>performance.getEntriesByName("probe-press")[0].startTime);
  const sp=new Promise(r=>s.on("Tracing.tracingComplete",e=>r(e.stream)));
  await s.send("Tracing.end"); const st=await sp; let raw="";
  for(;;){const c=await s.send("IO.read",{handle:st}); raw+=c.base64Encoded?Buffer.from(c.data,"base64").toString("utf8"):c.data; if(c.eof)break;}
  await s.send("IO.close",{handle:st});
  const ev=JSON.parse(raw).traceEvents??[];
  const mk=ev.find(e=>e.name==="probe-press"&&e.cat?.includes("blink.user_timing"));
  const toMs=us=>press+(us-mk.ts)/1000;
  const inR=ms=>rides.some(x=>ms>=x+120&&ms<=x+RIDE);
  let n=0,tot=0;
  for(const e of ev){ if(e.ph!=="X"||!e.dur)continue; if(e.name!=="Document::recalcStyle"||!inR(toMs(e.ts)))continue; n++; tot+=e.dur/1000; }
  console.log(`${label.padEnd(58)} ${(tot/Math.max(1,n)).toFixed(2)}ms/frame`);
};

await run("A) widget's own animations", null);

// Capture the widget's REAL keyframes, cancel, then re-create them identically.
await run("B) SAME keyframes, re-created by me", new Function(`return ()=>{
  const dots=[...document.querySelectorAll('[class*="dot_PW"], [class*="activeDot_PW"]')];
  const captured=[];
  document.getAnimations().forEach(a=>{
    const el=a.effect&&a.effect.target;
    if(!el||!dots.includes(el))return;
    const kf=a.effect.getKeyframes().map(k=>({transform:k.transform, opacity:k.opacity}));
    const d=a.effect.getTiming().duration;
    captured.push({el,kf,d});
    a.cancel();
  });
  captured.forEach(({el,kf,d})=>el.animate(kf,{duration:d,fill:'both'}));
}`)());

// Same, but strip opacity from the keyframes (transform only).
await run("C) SAME keyframes, opacity stripped", new Function(`return ()=>{
  const dots=[...document.querySelectorAll('[class*="dot_PW"], [class*="activeDot_PW"]')];
  const captured=[];
  document.getAnimations().forEach(a=>{
    const el=a.effect&&a.effect.target;
    if(!el||!dots.includes(el))return;
    const kf=a.effect.getKeyframes().map(k=>({transform:k.transform}));
    const d=a.effect.getTiming().duration;
    captured.push({el,kf,d});
    a.cancel();
  });
  captured.forEach(({el,kf,d})=>el.animate(kf,{duration:d,fill:'both'}));
}`)());
await browser.close();
