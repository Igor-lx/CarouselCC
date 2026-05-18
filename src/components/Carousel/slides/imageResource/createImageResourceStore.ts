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

/**
 * Offscreen warm-up images are deliberately low priority: they must never
 * compete with the images of slides the user is currently looking at.
 */
const PRELOAD_FETCH_PRIORITY = "low" as const;

/** Idle-decode scheduler tuning (mirrors the browser's idle-callback model). */
const IDLE_DECODE_MIN_BUDGET_MS = 8;
const IDLE_DECODE_FALLBACK_DELAY_MS = 160;
const IDLE_DECODE_FALLBACK_BATCH_SIZE = 1;
const DECODE_QUEUE_COMPACT_HEAD_LIMIT = 32;

/**
 * Shared snapshot for an untracked URL. A URL the store has never seen is
 * assumed to be `loading` so the slide renders its `<img>` and the element's
 * own `onLoad`/`onError` then become the authoritative report.
 */
const LOADING_SNAPSHOT: ImageResourceSnapshot = Object.freeze({
  status: "loading",
  generation: 0,
});

/** Internal, mutable bookkeeping for one image URL. */
interface ImageEntry {
  status: ImageStatus;
  generation: number;
  /** Failed attempts so far — drives retry backoff and the give-up cap. */
  failureCount: number;
  /**
   * Offscreen warm-up element when the store owns the fetch; `null` when the
   * resource is only observed through a rendered slide's on-screen `<img>`.
   */
  preloadElement: HTMLImageElement | null;
  /** True once `preloadElement` has been handed to `decode()`. */
  decodeRequested: boolean;
  /** Pending retry timer handle, or `null`. */
  retryTimer: number | null;
  /** Frozen snapshot exposed to React; replaced only on a real change. */
  snapshot: ImageResourceSnapshot;
}

/**
 * Creates one image-resource store. The store has no React dependency; it is
 * a plain observable map of `url -> ImageEntry`. `useImageResource` adapts it
 * to React with `useSyncExternalStore`.
 *
 * Ownership rules that keep image renderability single-sourced:
 *  - exactly one entry per URL;
 *  - `preload` opens an offscreen fetch only for URLs nothing else tracks;
 *  - speculative warm-up failures never become visible errors by themselves;
 *  - a rendered slide reports its real `<img>` outcome via `reportLoaded` /
 *    `reportError`, which is authoritative (it is what the user actually sees);
 *  - retry is owned here — one timer per URL, exponential backoff, capped.
 */
export function createImageResourceStore(): ImageResourceStore {
  const entries = new Map<string, ImageEntry>();
  const listeners = new Map<string, Set<() => void>>();
  const decodeQueue: string[] = [];
  const queuedDecodeUrls = new Set<string>();
  const canUseDom = typeof window !== "undefined";

  let decodeQueueHead = 0;
  let idleHandle: number | null = null;
  let idleTimer: number | null = null;
  let decodeEnabled = false;
  let disposed = false;

  const notify = (url: string): void => {
    const set = listeners.get(url);
    if (!set) return;
    set.forEach((listener) => listener());
  };

  /** Apply a status change and publish a fresh frozen snapshot if it differs. */
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

  const createEntry = (): ImageEntry => ({
    status: "loading",
    generation: 0,
    failureCount: 0,
    preloadElement: null,
    decodeRequested: false,
    retryTimer: null,
    snapshot: LOADING_SNAPSHOT,
  });

  const clearRetryTimer = (entry: ImageEntry): void => {
    if (entry.retryTimer === null) return;
    window.clearTimeout(entry.retryTimer);
    entry.retryTimer = null;
  };

  /** Detach an offscreen warm-up element so it stops fetching and can be GC'd. */
  const releaseEntry = (entry: ImageEntry): void => {
    clearRetryTimer(entry);
    const element = entry.preloadElement;
    if (element) {
      element.onload = null;
      element.onerror = null;
      element.removeAttribute("src");
      entry.preloadElement = null;
    }
  };

  const handleLoaded = (entry: ImageEntry, url: string): void => {
    entry.failureCount = 0;
    clearRetryTimer(entry);
    commit(entry, url, "loaded", false);
  };

  const handleVisibleError = (entry: ImageEntry, url: string): void => {
    entry.failureCount += 1;
    commit(entry, url, "error", false);
  };

  const handleWarmupError = (entry: ImageEntry): void => {
    const element = entry.preloadElement;
    if (!element) return;
    element.onload = null;
    element.onerror = null;
    // Keep the entry: a speculative miss must not become a visible error, but
    // it should also not be retried on every later idle window.
    entry.preloadElement = null;
  };

  // --- idle decode --------------------------------------------------------
  // Decoding an offscreen image moves the (otherwise on-paint) decode cost off
  // the critical path: when the matching slide later mounts its `<img>`, the
  // browser's decoded-image cache is already warm. We do it on idle time so it
  // never contends with an in-flight motion segment.

  const decodeOne = (url: string): void => {
    const entry = entries.get(url);
    if (!entry || entry.decodeRequested) return;
    const element = entry.preloadElement;
    if (!element || entry.status !== "loaded") return;
    entry.decodeRequested = true;
    if (typeof element.decode === "function") {
      // Best-effort: a decode rejection (e.g. element re-pointed) is harmless.
      element.decode().catch(() => undefined);
    }
  };

  const hasQueuedDecode = (): boolean =>
    queuedDecodeUrls.size > 0;

  const resetDecodeQueueIfEmpty = (): void => {
    if (queuedDecodeUrls.size > 0) return;
    decodeQueue.length = 0;
    decodeQueueHead = 0;
  };

  const compactDecodeQueue = (): void => {
    if (
      decodeQueueHead < DECODE_QUEUE_COMPACT_HEAD_LIMIT ||
      decodeQueueHead * 2 < decodeQueue.length
    ) {
      return;
    }
    decodeQueue.splice(0, decodeQueueHead);
    decodeQueueHead = 0;
  };

  const dequeueDecode = (): string | null => {
    while (decodeQueueHead < decodeQueue.length) {
      const url = decodeQueue[decodeQueueHead++]!;
      if (!queuedDecodeUrls.delete(url)) continue;
      compactDecodeQueue();
      resetDecodeQueueIfEmpty();
      return url;
    }
    compactDecodeQueue();
    resetDecodeQueueIfEmpty();
    return null;
  };

  const cancelScheduledDecode = (): void => {
    if (!canUseDom) return;
    if (idleHandle !== null) window.cancelIdleCallback?.(idleHandle);
    if (idleTimer !== null) window.clearTimeout(idleTimer);
    idleHandle = null;
    idleTimer = null;
  };

  const drainDecodeQueue = (hasBudget: () => boolean): void => {
    idleHandle = null;
    idleTimer = null;
    if (!decodeEnabled) return;
    while (hasBudget()) {
      const url = dequeueDecode();
      if (url === null) break;
      decodeOne(url);
    }
    if (hasQueuedDecode()) pumpDecodeQueue();
  };

  function pumpDecodeQueue(): void {
    if (!canUseDom || disposed || !decodeEnabled) return;
    if (idleHandle !== null || idleTimer !== null) return;
    if (!hasQueuedDecode()) return;

    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback((deadline) => {
        drainDecodeQueue(
          () => deadline.timeRemaining() > IDLE_DECODE_MIN_BUDGET_MS,
        );
      });
      return;
    }

    idleTimer = window.setTimeout(() => {
      let remaining = IDLE_DECODE_FALLBACK_BATCH_SIZE;
      drainDecodeQueue(() => remaining-- > 0);
    }, IDLE_DECODE_FALLBACK_DELAY_MS);
  }

  const enqueueDecode = (url: string): void => {
    const entry = entries.get(url);
    if (!entry || entry.decodeRequested || !entry.preloadElement) return;
    if (queuedDecodeUrls.has(url)) return;
    queuedDecodeUrls.add(url);
    decodeQueue.push(url);
    pumpDecodeQueue();
  };

  // --- offscreen warm-up fetch -------------------------------------------

  const startPreloadFetch = (url: string, entry: ImageEntry): void => {
    const element = new Image();
    entry.preloadElement = element;
    element.decoding = "async";
    element.fetchPriority = PRELOAD_FETCH_PRIORITY;

    element.onload = () => {
      if (disposed) return;
      handleLoaded(entry, url);
      enqueueDecode(url);
    };
    element.onerror = () => {
      if (disposed) return;
      handleWarmupError(entry);
    };

    element.src = url;

    // A URL already in the browser cache can resolve synchronously; the load
    // event would then never fire, so settle it here.
    if (element.complete && element.naturalWidth > 0) {
      handleLoaded(entry, url);
      enqueueDecode(url);
    }
  };

  /** Lazily create an entry for a URL only an on-screen `<img>` is loading. */
  const observeEntry = (url: string): ImageEntry => {
    let entry = entries.get(url);
    if (!entry) {
      entry = createEntry();
      entries.set(url, entry);
    }
    return entry;
  };

  // --- public API ---------------------------------------------------------

  return {
    getSnapshot(url) {
      return entries.get(url)?.snapshot ?? LOADING_SNAPSHOT;
    },

    observe(url) {
      observeEntry(url);
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

    preload(urls) {
      if (!canUseDom || disposed) return;
      for (const url of urls) {
        // Skip anything already tracked: a warm-up is redundant once either an
        // earlier preload or a rendered slide owns the fetch for this URL.
        if (entries.has(url)) continue;
        const entry = createEntry();
        entries.set(url, entry);
        startPreloadFetch(url, entry);
      }
    },

    setDecodeEnabled(enabled) {
      decodeEnabled = enabled;
      if (!enabled) {
        cancelScheduledDecode();
        return;
      }
      pumpDecodeQueue();
    },

    reportLoaded(url) {
      handleLoaded(observeEntry(url), url);
    },

    reportError(url) {
      handleVisibleError(observeEntry(url), url);
    },

    requestRetry(url) {
      if (!canUseDom || disposed) return;
      const entry = entries.get(url);
      if (!entry || entry.status !== "error") return;
      if (entry.retryTimer !== null) return; // a retry is already scheduled
      if (entry.failureCount >= IMAGE_RETRY_MAX_ATTEMPTS) return; // gave up

      const delay = Math.min(
        IMAGE_RETRY_MAX_DELAY_MS,
        IMAGE_RETRY_BASE_DELAY_MS * 2 ** (entry.failureCount - 1),
      );

      entry.retryTimer = window.setTimeout(() => {
        entry.retryTimer = null;
        if (disposed || entry.status !== "error") return;
        // Flip to `loading` and bump the generation: the subscribed slide
        // remounts its `<img>` (new `key`) and the fresh element re-fetches.
        // Its `onLoad`/`onError` then report the real outcome back here.
        commit(entry, url, "loading", true);
      }, delay);
    },

    prune(allowed) {
      const keep = new Set(allowed);
      entries.forEach((entry, url) => {
        if (keep.has(url)) return;
        // A URL with live subscribers is still on screen — never drop it.
        if (listeners.get(url)?.size) return;
        releaseEntry(entry);
        entries.delete(url);
        queuedDecodeUrls.delete(url);
        resetDecodeQueueIfEmpty();
      });
    },

    dispose() {
      disposed = true;
      cancelScheduledDecode();
      entries.forEach(releaseEntry);
      entries.clear();
      listeners.clear();
      decodeQueue.length = 0;
      queuedDecodeUrls.clear();
      decodeQueueHead = 0;
    },
  };
}
