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
  console.log(`${label.padEnd(60)} ${(tot/Math.max(1,n)).toFixed(2)}ms/frame`);
};

const CAP=`
  const dots=[...document.querySelectorAll('[class*="dot_PW"], [class*="activeDot_PW"]')];
  const cap=[];
  document.getAnimations().forEach(a=>{
    const el=a.effect&&a.effect.target;
    if(!el||!dots.includes(el))return;
    cap.push({el, kf:a.effect.getKeyframes().map(k=>({transform:k.transform,opacity:k.opacity})), d:a.effect.getTiming().duration});
    a.cancel();
  });`;

await run("A) widget's own", null);

await run("B) widget kf, values ROUNDED to 1 decimal", new Function(`return ()=>{ ${CAP}
  const r=(s)=>String(s).replace(/-?\d+\.\d+/g, m=>Number(m).toFixed(1));
  cap.forEach(({el,kf,d})=>el.animate(kf.map(k=>({transform:r(k.transform), opacity:Math.round(k.opacity*100)/100})),{duration:d,fill:'both'}));
}`)());

await run("C) simple values, DISTINCT array per dot", new Function(`return ()=>{ ${CAP}
  cap.forEach(({el,d},i)=>{
    const kf=Array.from({length:33},(_,k)=>({transform:'translate3d('+(k*2+i)+'px,0,0) scale('+(1-k*0.02)+')',opacity:1-k*0.02}));
    el.animate(kf,{duration:d,fill:'both'});
  });
}`)());

await run("D) simple values, SHARED array (my earlier test)", new Function(`return ()=>{ ${CAP}
  const kf=Array.from({length:33},(_,k)=>({transform:'translate3d('+(k*2)+'px,0,0) scale('+(1-k*0.02)+')',opacity:1-k*0.02}));
  cap.forEach(({el,d})=>el.animate(kf,{duration:d,fill:'both'}));
}`)());
await browser.close();
