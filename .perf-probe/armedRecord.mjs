/**
 * Armed screen recording: waits for the user's FIRST touch, then records the
 * phone's screen for 18s. Ground truth — what the display actually showed.
 */
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright-core";
const exec = promisify(execFile);
const ADB = process.env.USERPROFILE + "/platform-tools/adb.exe";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const pages = browser.contexts().flatMap(c => c.pages());
const page = pages.find(p => p.url().includes("CarouselCC")) ?? pages[0];
await page.bringToFront();
if (!page.url().includes("CarouselCC")) {
  await page.goto("https://igor-lx.github.io/CarouselCC/", { waitUntil: "load" });
  await page.waitForTimeout(1500);
}
await page.evaluate(() => {
  window.__rec = false;
  addEventListener("touchstart", () => { window.__rec = true; }, { capture: true, once: true });
});

console.log(">>> ARMED — touch the screen to START the recording, then keep swiping SLOWLY <<<");
await page.waitForFunction("window.__rec === true", null, { timeout: 0 });
console.log(">>> RECORDING 18s — keep swiping <<<");

await exec(ADB, ["shell", "rm", "-f", "/sdcard/rec3.mp4"]).catch(() => {});
const rec = spawn(ADB, ["shell", "screenrecord", "--bit-rate", "20M", "--time-limit", "18", "/sdcard/rec3.mp4"]);
await new Promise(r => rec.on("close", r));
await browser.close();

await exec(ADB, ["pull", "/sdcard/rec3.mp4", "C:/dev/CarouselCC/.perf-probe/out/rec3.mp4"]);
console.log("pulled -> .perf-probe/out/rec3.mp4");
