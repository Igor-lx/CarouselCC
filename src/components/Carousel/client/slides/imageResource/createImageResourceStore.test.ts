// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IMAGE_RETRY } from "../../config";
import { createImageResourceStore } from "./createImageResourceStore";
import type { ImageResourceStore } from "./types";

let store: ImageResourceStore;

beforeEach(() => {
  store = createImageResourceStore();
});

afterEach(() => {
  store.dispose();
  vi.useRealTimers();
});

describe("render-status SSOT", () => {
  it("reads an untracked URL as optimistically loading", () => {
    const snapshot = store.getSnapshot("unseen");
    expect(snapshot.status).toBe("loading");
    expect(snapshot.generation).toBe(0);
  });

  it("records a real visible load outcome", () => {
    store.reportLoaded("u");
    expect(store.getSnapshot("u").status).toBe("loaded");
  });

  it("records a real visible error outcome", () => {
    store.reportError("u");
    expect(store.getSnapshot("u").status).toBe("error");
  });

  it("keeps the same frozen snapshot object until something changes", () => {
    store.reportLoaded("u");
    const first = store.getSnapshot("u");
    const second = store.getSnapshot("u");
    expect(first).toBe(second);
  });

  it("notifies per-URL subscribers only on a real change", () => {
    const listener = vi.fn();
    store.subscribe("u", listener);
    store.reportError("u");
    expect(listener).toHaveBeenCalledTimes(1);
    store.reportError("u"); // already error -> status unchanged, no new frame
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe("u", listener);
    unsubscribe();
    store.reportError("u");
    expect(listener).not.toHaveBeenCalled();
  });

  it("clears the failure count on a successful load", () => {
    vi.useFakeTimers();
    store.reportError("u");
    store.reportLoaded("u"); // a later retry succeeded
    store.reportError("u"); // a fresh failure starts backoff from scratch
    store.requestRetry("u");
    vi.advanceTimersByTime(IMAGE_RETRY.baseDelayMs);
    expect(store.getSnapshot("u").status).toBe("loading");
  });
});

describe("retry policy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("flips an errored URL back to loading with a bumped generation after backoff", () => {
    store.reportError("u");
    const before = store.getSnapshot("u");
    expect(before.status).toBe("error");

    store.requestRetry("u");
    vi.advanceTimersByTime(IMAGE_RETRY.baseDelayMs);

    const after = store.getSnapshot("u");
    expect(after.status).toBe("loading");
    expect(after.generation).toBe(before.generation + 1);
  });

  it("does not retry a URL that is not in error", () => {
    store.reportLoaded("u");
    store.requestRetry("u");
    vi.advanceTimersByTime(60_000);
    expect(store.getSnapshot("u").status).toBe("loaded");
  });

  it("deduplicates concurrent retry requests into a single timer", () => {
    const listener = vi.fn();
    store.subscribe("u", listener);
    store.reportError("u");
    listener.mockClear();

    store.requestRetry("u");
    store.requestRetry("u");
    vi.advanceTimersByTime(IMAGE_RETRY.baseDelayMs);

    expect(listener).toHaveBeenCalledTimes(1); // one loading frame, not two
  });

  it("gives up after the capped number of attempts", () => {
    for (let i = 0; i < IMAGE_RETRY.maxAttempts; i += 1) {
      store.reportError("u");
    }
    store.requestRetry("u");
    vi.advanceTimersByTime(60_000);
    expect(store.getSnapshot("u").status).toBe("error");
  });
});

describe("prune", () => {
  it("drops tracked URLs outside the allowed set", () => {
    store.reportLoaded("keep");
    store.reportLoaded("drop");
    store.prune(["keep"]);
    expect(store.getSnapshot("keep").status).toBe("loaded");
    expect(store.getSnapshot("drop").status).toBe("loading"); // back to untracked default
  });

  it("cancels a pending retry timer for a dropped URL", () => {
    vi.useFakeTimers();
    store.reportError("drop");
    store.requestRetry("drop");
    store.prune([]); // drop everything, releasing the timer
    vi.advanceTimersByTime(60_000);
    // The dropped entry is gone and untracked; the timer never re-published.
    expect(store.getSnapshot("drop").status).toBe("loading");
  });
});

describe("soft lifecycle / reuse after dispose", () => {
  it("stays usable after dispose() — render status still records", () => {
    store.dispose();
    store.reportLoaded("u");
    expect(store.getSnapshot("u").status).toBe("loaded");
  });

  it("stays usable after dispose() — retry is still scheduled", () => {
    vi.useFakeTimers();
    store.dispose();
    store.reportError("u");
    store.requestRetry("u");
    vi.advanceTimersByTime(IMAGE_RETRY.baseDelayMs);
    expect(store.getSnapshot("u").status).toBe("loading");
  });

  it("dispose() is idempotent", () => {
    store.dispose();
    expect(() => store.dispose()).not.toThrow();
  });
});
