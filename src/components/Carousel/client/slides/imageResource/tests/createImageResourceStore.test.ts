// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IMAGE_RETRY } from "../../../config";
import { createImageResourceStore } from "../createImageResourceStore";
import type { ImageResourceStore } from "../types";

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

describe("notifying subscribers is re-entrant", () => {
  it("does not call a listener that unsubscribed during the notification", () => {
    // Every listener here is a React `useSyncExternalStore` callback, and one
    // of them unmounting its slide mid-notification is ordinary: a settle
    // commits, the window shrinks, and the subscriber is gone before the loop
    // reaches it. Calling it anyway schedules an update on a dead tree.
    // Listeners run in subscription order, so the one doing the unsubscribing
    // has to be registered FIRST — otherwise the victim has already run and
    // the guard is never the thing answering.
    const calls: string[] = [];
    let unsubscribeSecond = (): void => undefined;
    store.subscribe("u", () => {
      calls.push("first");
      unsubscribeSecond();
    });
    unsubscribeSecond = store.subscribe("u", () => calls.push("second"));

    store.reportLoaded("u");

    expect(calls).toEqual(["first"]);
  });

  it("does not call a listener that subscribed during the notification", () => {
    // The mirror: a listener added mid-loop has not seen the state before the
    // change, so the notification it would receive is about nothing.
    const calls: string[] = [];
    store.subscribe("u", () => {
      calls.push("first");
      store.subscribe("u", () => calls.push("late"));
    });

    store.reportLoaded("u");

    expect(calls).toEqual(["first"]);
  });
});

describe("the subscription bookkeeping", () => {
  it("keeps the URL watched while any listener is left", () => {
    const seen: string[] = [];
    const off = store.subscribe("u", () => seen.push("a"));
    store.subscribe("u", () => seen.push("b"));

    off();
    store.reportLoaded("u");

    expect(seen).toEqual(["b"]);
  });

  it("takes a fresh subscription after the last listener left", () => {
    // The empty set is dropped from the map; the next subscribe has to build
    // a new one rather than add to a set nobody is holding.
    const off = store.subscribe("u", () => undefined);
    off();

    const seen: string[] = [];
    store.subscribe("u", () => seen.push("again"));
    store.reportLoaded("u");

    expect(seen).toEqual(["again"]);
  });

  it("unsubscribing twice is harmless", () => {
    const off = store.subscribe("u", () => undefined);
    off();
    expect(() => off()).not.toThrow();
  });
});

describe("what counts as a change worth committing", () => {
  it("notifies again when a retry moves the generation but not the status", () => {
    // After a retry the status is `loading` — which it was before the error
    // too. Only the generation separates them, and it is what makes the slide
    // remount its `<img>` and fetch again. Comparing the status alone would
    // swallow the notification and the retry would never reach the DOM.
    vi.useFakeTimers();
    let notifications = 0;
    store.subscribe("u", () => {
      notifications += 1;
    });

    store.reportError("u");
    const afterError = notifications;

    store.requestRetry("u");
    vi.advanceTimersByTime(IMAGE_RETRY.baseDelayMs);

    expect(store.getSnapshot("u").status).toBe("loading");
    expect(notifications).toBeGreaterThan(afterError);
  });

  it("does not resurrect a URL that loaded while a retry was pending", () => {
    // A slide that loaded from cache in the meantime must not be pushed back
    // to `loading` and made to fetch all over again.
    //
    // Two defences hold this, and neither can be tested alone: the load
    // cancels the timer, and the timer re-checks the status before acting.
    // Remove either and the other still answers; remove BOTH and this case
    // goes red, which is what makes it a test of the guarantee rather than of
    // one implementation of it.
    vi.useFakeTimers();
    store.reportError("u");
    store.requestRetry("u");
    store.reportLoaded("u");

    vi.advanceTimersByTime(IMAGE_RETRY.maxDelayMs);

    expect(store.getSnapshot("u").status).toBe("loaded");
  });
});

describe("the backoff is exponential, not flat", () => {
  it("doubles the wait with every further failure", () => {
    // A flat delay turns a dead CDN into a steady request stream from every
    // slide at once; the point of the curve is that it gets out of the way.
    vi.useFakeTimers();

    store.reportError("u"); // failure 1 → base
    store.requestRetry("u");
    vi.advanceTimersByTime(IMAGE_RETRY.baseDelayMs);
    expect(store.getSnapshot("u").status).toBe("loading");

    store.reportError("u"); // failure 2 → twice base
    store.requestRetry("u");
    vi.advanceTimersByTime(IMAGE_RETRY.baseDelayMs);
    expect(store.getSnapshot("u").status).toBe("error");

    vi.advanceTimersByTime(IMAGE_RETRY.baseDelayMs);
    expect(store.getSnapshot("u").status).toBe("loading");
  });
});
