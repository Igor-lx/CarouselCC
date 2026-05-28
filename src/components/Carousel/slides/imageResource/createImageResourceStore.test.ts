import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  IMAGE_RETRY_BASE_DELAY_MS,
  IMAGE_RETRY_MAX_ATTEMPTS,
} from "../../config";
import { createImageResourceStore } from "./createImageResourceStore";
import type { ImageResourceStore } from "./types";

let store: ImageResourceStore;

beforeEach(() => {
  vi.stubGlobal("window", {
    clearTimeout: (...args: Parameters<typeof globalThis.clearTimeout>) =>
      globalThis.clearTimeout(...args),
    setTimeout: (...args: Parameters<typeof globalThis.setTimeout>) =>
      globalThis.setTimeout(...args),
  });
  store = createImageResourceStore();
});

afterEach(() => {
  store.dispose();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("render-status SSOT", () => {
  it("reads an untracked URL as optimistically loading", () => {
    const snapshot = store.getSnapshot("unseen");
    expect(snapshot.status).toBe("loading");
    expect(snapshot.generation).toBe(0);
  });

  it("records real visible load and error outcomes", () => {
    store.reportLoaded("u");
    expect(store.getSnapshot("u").status).toBe("loaded");

    store.reportError("u");
    expect(store.getSnapshot("u").status).toBe("error");
  });

  it("notifies per-URL subscribers only on a real change", () => {
    const listener = vi.fn();
    store.subscribe("u", listener);

    store.reportError("u");
    store.reportError("u");

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe("u", listener);
    unsubscribe();

    store.reportError("u");

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("retry policy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("flips an errored URL back to loading with a bumped generation after backoff", () => {
    store.reportError("u");
    const before = store.getSnapshot("u");

    store.requestRetry("u");
    vi.advanceTimersByTime(IMAGE_RETRY_BASE_DELAY_MS);

    const after = store.getSnapshot("u");
    expect(after.status).toBe("loading");
    expect(after.generation).toBe(before.generation + 1);
  });

  it("deduplicates concurrent retry requests into a single timer", () => {
    const listener = vi.fn();
    store.subscribe("u", listener);
    store.reportError("u");
    listener.mockClear();

    store.requestRetry("u");
    store.requestRetry("u");
    vi.advanceTimersByTime(IMAGE_RETRY_BASE_DELAY_MS);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending retry after a visible load succeeds", () => {
    const listener = vi.fn();
    store.subscribe("u", listener);
    store.reportError("u");
    store.requestRetry("u");
    listener.mockClear();

    store.reportLoaded("u");
    vi.advanceTimersByTime(IMAGE_RETRY_BASE_DELAY_MS);

    expect(store.getSnapshot("u").status).toBe("loaded");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("gives up after the capped number of attempts", () => {
    for (let i = 0; i < IMAGE_RETRY_MAX_ATTEMPTS; i += 1) {
      store.reportError("u");
    }

    store.requestRetry("u");
    vi.advanceTimersByTime(60_000);

    expect(store.getSnapshot("u").status).toBe("error");
  });
});

describe("prune / lifecycle", () => {
  it("drops tracked URLs outside the allowed set", () => {
    store.reportLoaded("keep");
    store.reportLoaded("drop");

    store.prune(["keep"]);

    expect(store.getSnapshot("keep").status).toBe("loaded");
    expect(store.getSnapshot("drop").status).toBe("loading");
  });

  it("clears retry timers for pruned URLs", () => {
    vi.useFakeTimers();
    const listener = vi.fn();
    store.subscribe("drop", listener);
    store.reportError("drop");
    store.requestRetry("drop");
    listener.mockClear();

    store.prune([]);
    vi.advanceTimersByTime(IMAGE_RETRY_BASE_DELAY_MS);

    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot("drop").status).toBe("loading");
  });

  it("stays usable after dispose()", () => {
    store.dispose();
    store.reportLoaded("u");
    expect(store.getSnapshot("u").status).toBe("loaded");
  });

  it("dispose() is idempotent", () => {
    store.dispose();
    expect(() => store.dispose()).not.toThrow();
  });
});
