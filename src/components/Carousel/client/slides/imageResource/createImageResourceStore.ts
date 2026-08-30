// See docs/architecture/slides.md
import { IMAGE_RETRY } from "../../config";
import type {
  ImageResourceSnapshot,
  ImageResourceStore,
  ImageStatus,
} from "./types";

/** Untracked-URL snapshot — assumed `loading` so the slide renders its `<img>`. */
const LOADING_SNAPSHOT: ImageResourceSnapshot = Object.freeze({
  status: "loading",
  generation: 0,
});

/** Internal, mutable bookkeeping for one image URL. */
interface ImageEntry {
  /** Public renderability SSOT exposed through snapshots. */
  status: ImageStatus;
  generation: number;
  /** Failed visible attempts so far — drives retry backoff and the give-up cap. */
  failureCount: number;
  /** Pending retry timer handle, or `null`. */
  retryTimer: number | null;
  /** Frozen snapshot exposed to React; replaced only on a real change. */
  snapshot: ImageResourceSnapshot;
}

export function createImageResourceStore(): ImageResourceStore {
  const entries = new Map<string, ImageEntry>();
  const listeners = new Map<string, Set<() => void>>();
  const canUseDom = typeof window !== "undefined";

  const notify = (url: string): void => {
    const set = listeners.get(url);
    if (!set) return;
    // Snapshot + membership: a listener that subscribes during this
    // notification must not receive it, and one that unsubscribes during it
    // must not be called after the fact.
    for (const listener of [...set]) {
      if (set.has(listener)) listener();
    }
  };

  const createEntry = (): ImageEntry => ({
    status: "loading",
    generation: 0,
    failureCount: 0,
    retryTimer: null,
    snapshot: LOADING_SNAPSHOT,
  });

  const observeEntry = (url: string): ImageEntry => {
    let entry = entries.get(url);
    if (!entry) {
      entry = createEntry();
      entries.set(url, entry);
    }
    return entry;
  };

  const clearRetryTimer = (entry: ImageEntry): void => {
    if (entry.retryTimer === null || !canUseDom) return;
    window.clearTimeout(entry.retryTimer);
    entry.retryTimer = null;
  };

  /** Apply a render-status change and publish a fresh frozen snapshot. */
  const commit = (
    entry: ImageEntry,
    url: string,
    status: ImageStatus,
    bumpGeneration: boolean,
  ): void => {
    const generation = bumpGeneration ? entry.generation + 1 : entry.generation;
    if (entry.status === status && entry.generation === generation) return;
    entry.status = status;
    entry.generation = generation;
    entry.snapshot = Object.freeze({ status, generation });
    notify(url);
  };

  return {
    getSnapshot(url) {
      return entries.get(url)?.snapshot ?? LOADING_SNAPSHOT;
    },

    subscribe(url, listener) {
      let set = listeners.get(url);
      if (!set) {
        set = new Set();
        listeners.set(url, set);
      }
      set.add(listener);
      return () => {
        const current = listeners.get(url);
        if (!current) return;
        current.delete(listener);
        if (current.size === 0) listeners.delete(url);
      };
    },

    reportLoaded(url) {
      const entry = observeEntry(url);
      entry.failureCount = 0;
      clearRetryTimer(entry);
      commit(entry, url, "loaded", false);
    },

    reportError(url) {
      const entry = observeEntry(url);
      entry.failureCount += 1;
      clearRetryTimer(entry);
      commit(entry, url, "error", false);
    },

    requestRetry(url) {
      if (!canUseDom) return;
      const entry = entries.get(url);
      if (!entry || entry.status !== "error") return;
      if (entry.retryTimer !== null) return; // a retry is already scheduled
      if (entry.failureCount >= IMAGE_RETRY.maxAttempts) return; // gave up

      const delay = Math.min(
        IMAGE_RETRY.maxDelayMs,
        IMAGE_RETRY.baseDelayMs * 2 ** (entry.failureCount - 1),
      );

      entry.retryTimer = window.setTimeout(() => {
        entry.retryTimer = null;
        if (entry.status !== "error") return;
        // Bump generation → slide remounts its `<img>` and re-fetches (see doc).
        commit(entry, url, "loading", true);
      }, delay);
    },

    prune(allowed) {
      const keep = new Set(allowed);
      entries.forEach((entry, url) => {
        if (keep.has(url)) return;
        clearRetryTimer(entry);
        entries.delete(url);
      });
    },

    dispose() {
      // Soft, idempotent — store stays usable, StrictMode-safe (see doc).
      entries.forEach(clearRetryTimer);
      entries.clear();
      listeners.clear();
    },
  };
}
