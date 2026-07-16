/**
 * Salvage driver: the page is ALREADY instrumented (freezeRecord3's payload
 * survives — markers, event log, auto-ride on touch). This driver only:
 *   1. clears the stale event buffer and re-anchors the clock,
 *   2. starts screenrecord for 20s IMMEDIATELY (no arming),
 *   3. drains events during the take, pulls everything.
 *
 *   node .perf-probe/freezeSalvage.mjs
 */
import { spawn, execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";

const ADB = `${homedir()}/platform-tools/adb.exe`;

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const pageTarget = targets.find((t) => t.type === "page");
const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 1;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); }
};
const send = (method, params) =>
  new Promise((res) => { pending.set(id, res); ws.send(JSON.stringify({ id: id++, method, params })); });
const evaluate = async (expression) => {
  const r = await Promise.race([
    send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }),
    new Promise((_, rej) => setTimeout(() => rej(new Error("evaluate timeout")), 6000)),
  ]);
  return r?.result?.value;
};

const state = await evaluate(
  "JSON.stringify({inst: Boolean(window.__inst), evts: (window.__evt||[]).length})",
);
console.log("page state:", state);
if (!JSON.parse(state ?? "{}").inst) {
  console.log("NOT INSTRUMENTED — page must have reloaded; rerun freezeRecord3");
  process.exit(1);
}

// Arm: wait for the human's first touch, however long that takes.
await evaluate("window.__evt.length = 0, window.__armed = false, true");
console.log(">>> ВЗВЕДЕНО: запись начнётся с вашего ПЕРВОГО касания (16с) <<<");
for (;;) {
  const armed = await evaluate("Boolean(window.__armed)").catch(() => false);
  if (armed) break;
  await new Promise((r) => setTimeout(r, 300));
}
await evaluate("window.__t0 = performance.now(), window.__evt.length = 0, true");
console.log(">>> касание — ЗАПИСЬ ПОШЛА (16с) <<<");
const rec = spawn(ADB, ["shell", "screenrecord", "--time-limit", "16", "/sdcard/freeze.mp4"]);
rec.on("error", (e) => console.log("screenrecord spawn error:", e.message));

const drained = [];
const deadline = Date.now() + 16500;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 700));
  const chunk = await evaluate(
    "(() => { const c = window.__evt.splice(0); return JSON.stringify(c); })()",
  ).catch(() => null);
  if (chunk) drained.push(...JSON.parse(chunk));
}

await Promise.race([
  new Promise((resolve) => rec.on("exit", resolve)),
  new Promise((r) => setTimeout(r, 5000)),
]);
writeFileSync(".perf-probe/out/freeze-events.json", JSON.stringify(drained));
execSync(`"${ADB}" pull /sdcard/freeze.mp4 .perf-probe/out/freeze.mp4`, {
  env: { ...process.env, MSYS_NO_PATHCONV: "1" },
});
console.log(`events: ${drained.length}  pulled -> .perf-probe/out/freeze.mp4`);
ws.close();
