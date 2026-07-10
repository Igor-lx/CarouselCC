import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const CASES = [
  { os: "light", stored: null },
  { os: "dark", stored: null },
  { os: "light", stored: "dark" },
  { os: "dark", stored: "light" },
  { os: "light", stored: "garbage-value" },
];
for (const c of CASES) {
  const ctx = await browser.newContext({ colorScheme: c.os });
  const page = await ctx.newPage();
  if (c.stored !== null) {
    await page.addInitScript((v) => localStorage.setItem("theme-mode", v), c.stored);
  }
  await page.goto("http://localhost:4173/CarouselCC/", { waitUntil: "domcontentloaded" });
  const r = await page.evaluate(() => ({
    dataTheme: document.documentElement.getAttribute("data-theme"),
    inlineBg: document.documentElement.style.backgroundColor,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    metas: [...document.querySelectorAll('meta[name="theme-color"]')].map(
      (m) => (m.getAttribute("media")?.includes("dark") ? "D:" : m.getAttribute("media") ? "L:" : "?:") + m.getAttribute("content"),
    ),
  }));
  console.log(`os=${c.os} stored=${c.stored}`.padEnd(32), JSON.stringify(r));
  await ctx.close();
}
await browser.close();
