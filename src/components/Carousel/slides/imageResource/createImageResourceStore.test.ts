// @vitest-environment jsdom
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

/**
 * Controllable `Image` stand-in: jsdom never fires load/error for a `src`
 * assignment, so tests drive the warm-up lifecycle by calling `onload` /
 * `onerror` on the recorded instances directly.
 */
class FakeImage {
  static instances: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = "";
  fetchPriority = "";
  complete = false;
  naturalWidth = 0;
  #src = "";

  set src(value: string) {
    this.#src = value;
    FakeImage.instances.push(this);
  }
  get src(): string {
    return this.#src;
  }

  decode(): Promise<void> {
    return Promise.resolve();
  }
  removeAttribute(): void {
    this.#src = "";
  }
}

let store: ImageResourceStore;

beforeEach(() => {
  FakeImage.instances = [];
  vi.stubGlobal("Image", FakeImage);
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

  it("records a real visible load outcome", () => {
    store.reportLoaded("u");
    expect(store.getSnapshot("u").status).toBe("loaded");
  });

  it("records a real visible error outcome", () => {
    store.reportError("u");
    expect(store.getSnapshot("u").status).toBe("error");
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

    expect(listener).toHaveBeenCalledTimes(1); // one loading frame, not two
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

describe("speculative warm-up", () => {
  it("opens an offscreen fetch for a URL in the preparation window", () => {
    store.syncPreparationWindow({ enabled: true, urls: ["w"] });
    expect(FakeImage.instances).toHaveLength(1);
    expect(FakeImage.instances[0]!.src).toBe("w");
  });

  it("promotes an untouched resource to loaded on warm-up success", () => {
    store.syncPreparationWindow({ enabled: true, urls: ["w"] });
    FakeImage.instances[0]!.onload?.();
    expect(store.getSnapshot("w").status).toBe("loaded");
  });

  it("keeps a warm-up failure non-authoritative — it never publishes error", () => {
    store.syncPreparationWindow({ enabled: true, urls: ["w"] });
    FakeImage.instances[0]!.onerror?.();
    expect(store.getSnapshot("w").status).toBe("loading");
  });

  it("never overrides a real visible error with a later warm-up success", () => {
    store.reportError("w");
    store.syncPreparationWindow({ enabled: true, urls: ["w"] });
    // a real DOM owner failed; warm-up must not be opened for it at all
    expect(FakeImage.instances).toHaveLength(0);
    expect(store.getSnapshot("w").status).toBe("error");
  });

  it("suspends an in-flight warm-up when a real visible owner appears", () => {
    store.syncPreparationWindow({ enabled: true, urls: ["w"] });
    const element = FakeImage.instances[0]!;
    store.observe("w"); // a SlideItem mounts and owns this URL
    expect(element.src).toBe(""); // warm-up element released
  });

  it("closes the session and stops warming when the window is disabled", () => {
    store.syncPreparationWindow({ enabled: true, urls: ["w"] });
    store.syncPreparationWindow({ enabled: false, urls: [] });
    FakeImage.instances[0]!.onload?.();
    // session is closed -> a late warm-up callback must not publish anything
    expect(store.getSnapshot("w").status).toBe("loading");
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

  it("never drops a URL with a live visible owner", () => {
    store.reportLoaded("owned");
    store.observe("owned");
    store.prune([]); // allow nothing
    expect(store.getSnapshot("owned").status).toBe("loaded");
  });
});
