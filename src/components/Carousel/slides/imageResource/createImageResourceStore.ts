import {
  IMAGE_RETRY_BASE_DELAY_MS,
  IMAGE_RETRY_MAX_ATTEMPTS,
  IMAGE_RETRY_MAX_DELAY_MS,
} from "../../config";
import type {
  ImageResourceSnapshot,
  ImageResourceStore,
  ImageStatus,
} from "./types";

const LOADING_SNAPSHOT: ImageResourceSnapshot = Object.freeze({
  status: "loading",
  generation: 0,
});

interface ImageEntry {
  status: ImageStatus;
  generation: number;
  failureCount: number;
  retryTimer: number | null;
  snapshot: ImageResourceSnapshot;
}

const createEntry = (): ImageEntry => ({
  status: "loading",
  generation: 0,
  failureCount: 0,
  retryTimer: null,
  snapshot: LOADING_SNAPSHOT,
});

/**
 * Creates a compact per-URL image status store.
 *
 * The store intentionally does not create offscreen `Image()` objects, does not
 * call `decode()`, and does not schedule browser work ahead of mounted `<img>`
 * elements. Browser image loading remains browser-owned. This layer only
 * provides the product contract that is still useful for a carousel with cloned
 * slides: one render status and one capped retry policy per URL.
 */
export function createImageResourceStore(): ImageResourceStore {
  const entries = new Map<string, ImageEntry>();
  const listeners = new Map<string, Set<() => void>>();
  const canUseDom = typeof window !== "undefined";

  const notify = (url: string): void => {
    const set = listeners.get(url);
    if (!set) return;
    set.forEach((listener) => listener());
  };

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

  const releaseEntry = (entry: ImageEntry): void => {
    clearRetryTimer(entry);
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
      if (entry.retryTimer !== null) return;
      if (entry.failureCount >= IMAGE_RETRY_MAX_ATTEMPTS) return;

      const delay = Math.min(
        IMAGE_RETRY_MAX_DELAY_MS,
        IMAGE_RETRY_BASE_DELAY_MS * 2 ** (entry.failureCount - 1),
      );

      entry.retryTimer = window.setTimeout(() => {
        entry.retryTimer = null;
        if (entry.status !== "error") return;
        commit(entry, url, "loading", true);
      }, delay);
    },

    prune(allowed) {
      const keep = new Set(allowed);
      entries.forEach((entry, url) => {
        if (keep.has(url)) return;
        releaseEntry(entry);
        entries.delete(url);
      });
    },

    dispose() {
      entries.forEach((entry) => releaseEntry(entry));
      entries.clear();
      listeners.clear();
    },
  };
}
