// Minimal Chrome DevTools Protocol driver: native WebSocket (Node 22+), no deps.
// Used by first-ride.mjs; see ./README.md.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

const findChrome = () => {
  const found = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (!found) {
    throw new Error(
      `No Chrome found. Set CHROME_PATH. Looked in:\n  ${CHROME_CANDIDATES.join("\n  ")}`,
    );
  }
  return found;
};

export async function launchChrome({ port = 9333 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), "carousel-perf-"));
  const child = spawn(
    findChrome(),
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      // The measurement IS the background behaviour; do not let Chrome throttle it.
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break;
    } catch {
      /* not listening yet */
    }
    await sleep(100);
  }

  return {
    port,
    kill() {
      child.kill();
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        /* the profile is a temp dir; losing it is harmless */
      }
    },
  };
}

export async function connect({ port = 9333 } = {}) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((target) => target.type === "page");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });

  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
      return;
    }
    for (const handler of listeners.get(message.method) ?? []) handler(message.params);
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

  const on = (method, handler) => {
    if (!listeners.has(method)) listeners.set(method, []);
    listeners.get(method).push(handler);
  };

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description ?? "evaluate failed");
    }
    return result.value;
  };

  return { send, on, evaluate, close: () => socket.close() };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
