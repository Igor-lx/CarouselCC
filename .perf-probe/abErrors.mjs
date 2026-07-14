/** Why does the A/B build render nothing? Surface console + failed requests. */
import { chromium } from "playwright-core";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().startsWith("http"));
if (!page) throw new Error("no page found on device");

page.on("console", (m) => console.log(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
page.on("requestfailed", (r) =>
  console.log(`[failed] ${r.url()} — ${r.failure()?.errorText}`),
);
page.on("response", (r) => {
  if (r.status() >= 400) console.log(`[${r.status()}] ${r.url()}`);
});

await page.goto("http://127.0.0.1:8080/off/", { waitUntil: "load" });
await page.waitForTimeout(3000);

const html = await page.evaluate(() => ({
  rootChildren: document.getElementById("root")?.childElementCount ?? -1,
  bodyHtml: document.body.innerHTML.slice(0, 300),
}));
console.log("\n", JSON.stringify(html, null, 2));

await browser.close();
