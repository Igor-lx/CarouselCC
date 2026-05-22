import {
  IMAGE_RETRY_BASE_DELAY_MS,
  IMAGE_RETRY_MAX_ATTEMPTS,
  IMAGE_RETRY_MAX_DELAY_MS,
} from "../../config";
import type {
  ImagePreparationWindow,
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
/**
 * `requestIdleCallback` exposes a real frame budget; the `setTimeout` fallback
 * does not, so it drains a fixed small batch per tick instead of the whole
 * queue at once - decoding the full window in one synchronous burst can jank
 * the main thread on a low-end device.
 */
const IDLE_DECODE_FALLBACK_BATCH_SIZE = 1;

/**
 * Shared snapshot for an untracked URL. A URL the store has never seen is
 * assumed to be `loading` so the slide renders its `<img>` and the element's
 * own `onLoad`/`onError` then become the authoritative report.
 */
const LOADING_SNAPSHOT: ImageResourceSnapshot = Object.freeze({
  status: "loading",
  generation: 0,
});

/**
 * Lifecycle of speculative offscreen preparation. It is intentionally
 * separate from public render status: warm-up is best-effort infrastructure,
 * not a second opinion about what the user can currently see.
 */
type WarmupStatus =
  | "unattempted"
  | "fetching"
  | "ready"
  | "failed"
  | "suspended";

interface WarmupLifecycle {
  status: WarmupStatus;
  sessionId: number | null;
  element: HTMLImageElement | null;
  decodeRequested: boolean;
}

/** Internal, mutable bookkeeping for one image URL. */
interface ImageEntry {
  /** Public renderability SSOT exposed through snapshots. */
  status: ImageStatus;
  generation: number;
  /** Failed visible attempts so far — drives retry backoff and the give-up cap. */
  failureCount: number;
  /** Count of currently mounted on-screen `<img>` owners for this URL. */
  visibleOwnerCount: number;
  /** Speculative offscreen preparation, modeled independently of render state. */
  warmup: WarmupLifecycle;
  /** Pending retry timer handle, or `null`. */
  retryTimer: number | null;
  /** Frozen snapshot exposed to React; replaced only on a real change. */
  snapshot: ImageResourceSnapshot;
}

interface PreparationSession {
  readonly id: number;
  readonly urls: Set<string>;
}

/**
 * Creates one image-resource store. The store has no React dependency; it is
 * a plain observable map of `url -> ImageEntry`. `useImageResource` adapts it
 * to React with `useSyncExternalStore`.
 *
 * Ownership rules that keep image renderability single-sourced:
 *  - exactly one render entry per URL;
 *  - visible DOM ownership and speculative warm-up ownership are explicit;
 *  - warm-up lifecycle is first-class, never inferred from `entries.has(url)`;
 *  - speculative warm-up failures never become visible errors by themselves;
 *  - a rendered slide reports its real `<img>` outcome via `reportLoaded` /
 *    `reportError`, which is authoritative (it is what the user actually sees);
 *  - retry is owned here — one timer per URL, exponential backoff, capped.
 *
 * Heavyweight offscreen warm-up elements are bounded by the active
 * preparation window: once a URL leaves the window its `Image` handle is
 * released, so warming nearby content never turns the store into a hidden
 * cache for an entire large deck. Lightweight per-URL render entries persist
 * for the live deck; the decode queue only ever holds the current window, so
 * a plain array is the right structure for it.
 */
export function createImageResourceStore(): ImageResourceStore {
  const entries = new Map<string, ImageEntry>();
  const listeners = new Map<string, Set<() => void>>();
  /** Pending idle-decode work — bounded by one preparation window. */
  const decodeQueue: string[] = [];
  const canUseDom = typeof window !== "undefined";

  let idleHandle: number | null = null;
  let idleTimer: number | null = null;
  let nextPreparationSessionId = 0;
  let activePreparationSession: PreparationSession | null = null;

  const notify = (url: string): void => {
    const set = listeners.get(url);
    if (!set) return;
    set.forEach((listener) => listener());
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

  const createEntry = (): ImageEntry => ({
    status: "loading",
    generation: 0,
    failureCount: 0,
    visibleOwnerCount: 0,
    warmup: {
      status: "unattempted",
      sessionId: null,
      element: null,
      decodeRequested: false,
    },
    retryTimer: null,
    snapshot: LOADING_SNAPSHOT,
  });

  const clearRetryTimer = (entry: ImageEntry): void => {
    if (entry.retryTimer === null) return;
    window.clearTimeout(entry.retryTimer);
    entry.retryTimer = null;
  };

  const releaseWarmupElement = (entry: ImageEntry): void => {
    const element = entry.warmup.element;
    if (!element) return;
    element.onload = null;
    element.onerror = null;
    element.removeAttribute("src");
    entry.warmup.element = null;
  };

  const suspendWarmup = (entry: ImageEntry): void => {
    if (entry.warmup.status !== "fetching") return;
    releaseWarmupElement(entry);
    entry.warmup.status = "suspended";
    entry.warmup.sessionId = null;
  };

  /** Release every heavyweight resource owned by one entry. */
  const releaseEntry = (entry: ImageEntry): void => {
    clearRetryTimer(entry);
    releaseWarmupElement(entry);
    entry.warmup.sessionId = null;
  };

  const handleVisibleLoaded = (entry: ImageEntry, url: string): void => {
    // Once the real DOM image has loaded, an in-flight speculative duplicate is
    // redundant. The visible outcome remains authoritative.
    suspendWarmup(entry);
    entry.failureCount = 0;
    clearRetryTimer(entry);
    commit(entry, url, "loaded", false);
  };

  const handleVisibleError = (entry: ImageEntry, url: string): void => {
    // Do not let a later speculative success overwrite the actual failed DOM
    // outcome the user observed.
    suspendWarmup(entry);
    entry.failureCount += 1;
    commit(entry, url, "error", false);
  };

  // --- idle preparation session ------------------------------------------

  const isActiveSession = (sessionId: number, url?: string): boolean => {
    const session = activePreparationSession;
    return (
      session !== null &&
      session.id === sessionId &&
      (url === undefined || session.urls.has(url))
    );
  };

  const clearDecodeQueue = (): void => {
    decodeQueue.length = 0;
  };

  const cancelScheduledDecode = (): void => {
    if (!canUseDom) return;
    if (idleHandle !== null) window.cancelIdleCallback?.(idleHandle);
    if (idleTimer !== null) window.clearTimeout(idleTimer);
    idleHandle = null;
    idleTimer = null;
  };

  /**
   * Release the heavyweight `Image` handle of every `ready` warm-up whose URL
   * is not in `retainedWindow` (a `null` window retains nothing). The render
   * entry is untouched; only the offscreen element is dropped, and the warm-up
   * lifecycle is reset to `unattempted` so it never claims `ready` without an
   * element behind it. Keeps warm-up memory bounded to the active window
   * regardless of deck size.
   */
  const releaseWarmupsOutsideWindow = (
    retainedWindow: ReadonlySet<string> | null,
  ): void => {
    entries.forEach((entry, url) => {
      if (retainedWindow?.has(url)) return;
      if (entry.warmup.status !== "ready") return;
      releaseWarmupElement(entry);
      entry.warmup.status = "unattempted";
      entry.warmup.sessionId = null;
      entry.warmup.decodeRequested = false;
    });
  };

  const closePreparationSession = (
    retainedWindow: ReadonlySet<string> | null = null,
  ): void => {
    const session = activePreparationSession;
    activePreparationSession = null;
    cancelScheduledDecode();
    clearDecodeQueue();

    if (session) {
      entries.forEach((entry) => {
        if (
          entry.warmup.status === "fetching" &&
          entry.warmup.sessionId === session.id
        ) {
          suspendWarmup(entry);
        }
      });
    }

    releaseWarmupsOutsideWindow(retainedWindow);
  };

  // --- idle decode --------------------------------------------------------
  // Decoding an offscreen image moves the otherwise on-paint decode cost off
  // the critical path: when the matching slide later mounts its `<img>`, the
  // browser's decoded-image cache is already warm. We do it on idle time so it
  // never contends with an in-flight motion segment.

  const decodeOne = (url: string, sessionId: number): void => {
    if (!isActiveSession(sessionId, url)) return;
    const entry = entries.get(url);
    if (!entry || entry.warmup.decodeRequested) return;
    const element = entry.warmup.element;
    if (
      !element ||
      entry.status !== "loaded" ||
      entry.warmup.status !== "ready"
    ) {
      return;
    }
    entry.warmup.decodeRequested = true;
    if (typeof element.decode === "function") {
      // Best-effort: a decode rejection (e.g. element re-pointed) is harmless.
      element.decode().catch(() => undefined);
    }
  };

  const drainDecodeQueue = (
    sessionId: number,
    hasBudget: () => boolean,
  ): void => {
    idleHandle = null;
    idleTimer = null;
    if (!isActiveSession(sessionId)) return;
    while (decodeQueue.length > 0 && hasBudget()) {
      decodeOne(decodeQueue.shift()!, sessionId);
    }
    if (decodeQueue.length > 0) pumpDecodeQueue();
  };

  function pumpDecodeQueue(): void {
    const session = activePreparationSession;
    if (!canUseDom || session === null) return;
    if (idleHandle !== null || idleTimer !== null) return;
    if (decodeQueue.length === 0) return;

    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback((deadline) => {
        drainDecodeQueue(
          session.id,
          () => deadline.timeRemaining() > IDLE_DECODE_MIN_BUDGET_MS,
        );
      });
      return;
    }

    idleTimer = window.setTimeout(() => {
      let remaining = IDLE_DECODE_FALLBACK_BATCH_SIZE;
      drainDecodeQueue(session.id, () => remaining-- > 0);
    }, IDLE_DECODE_FALLBACK_DELAY_MS);
  }

  const enqueueDecode = (url: string, sessionId: number): void => {
    if (!isActiveSession(sessionId, url)) return;
    const entry = entries.get(url);
    if (
      !entry ||
      entry.warmup.decodeRequested ||
      !entry.warmup.element ||
      entry.warmup.status !== "ready"
    ) {
      return;
    }
    if (decodeQueue.includes(url)) return;
    decodeQueue.push(url);
    pumpDecodeQueue();
  };

  // --- offscreen warm-up fetch -------------------------------------------

  const handleWarmupLoaded = (
    entry: ImageEntry,
    url: string,
    sessionId: number,
  ): void => {
    if (!isActiveSession(sessionId, url)) return;
    if (
      entry.warmup.status !== "fetching" ||
      entry.warmup.sessionId !== sessionId
    ) {
      return;
    }

    entry.warmup.status = "ready";
    entry.warmup.sessionId = null;

    // Warm-up may promote an untouched resource to loaded, but it must never
    // override a real visible failure or reset its retry history.
    if (entry.status === "loading" && entry.failureCount === 0) {
      commit(entry, url, "loaded", false);
    }

    enqueueDecode(url, sessionId);
  };

  const handleWarmupError = (entry: ImageEntry, sessionId: number): void => {
    if (
      entry.warmup.status !== "fetching" ||
      entry.warmup.sessionId !== sessionId
    ) {
      return;
    }
    releaseWarmupElement(entry);
    // Speculative misses are non-authoritative and terminal for background
    // warming; visible `<img>` loading remains the real source of truth.
    entry.warmup.status = "failed";
    entry.warmup.sessionId = null;
  };

  const startWarmupFetch = (
    url: string,
    entry: ImageEntry,
    sessionId: number,
  ): void => {
    const element = new Image();
    entry.warmup.status = "fetching";
    entry.warmup.sessionId = sessionId;
    entry.warmup.element = element;
    entry.warmup.decodeRequested = false;
    element.decoding = "async";
    element.fetchPriority = PRELOAD_FETCH_PRIORITY;

    // `dispose()` detaches these handlers via `releaseWarmupElement` and the
    // session-id check below guards a late callback, so no disposed-flag gate
    // is needed here.
    element.onload = () => handleWarmupLoaded(entry, url, sessionId);
    element.onerror = () => handleWarmupError(entry, sessionId);

    element.src = url;

    // A URL already in the browser cache can resolve synchronously; the load
    // event would then never fire, so settle it here.
    if (element.complete && element.naturalWidth > 0) {
      handleWarmupLoaded(entry, url, sessionId);
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

  const prepareIfEligible = (url: string, sessionId: number): void => {
    if (!isActiveSession(sessionId, url)) return;
    const entry = observeEntry(url);

    if (entry.warmup.status === "ready") {
      enqueueDecode(url, sessionId);
      return;
    }

    if (
      entry.status !== "loading" ||
      entry.failureCount > 0 ||
      entry.visibleOwnerCount > 0 ||
      entry.warmup.status === "fetching" ||
      entry.warmup.status === "failed"
    ) {
      return;
    }

    startWarmupFetch(url, entry, sessionId);
  };

  const matchesPreparationWindow = (
    session: PreparationSession,
    urls: readonly string[],
  ): boolean =>
    session.urls.size === urls.length &&
    urls.every((url) => session.urls.has(url));

  const openPreparationSession = (urls: readonly string[]): void => {
    const nextUrls = new Set(urls);
    // Closing with the next window as the retained set releases warm-ups
    // outside it in one pass — no separate release call is needed here.
    closePreparationSession(nextUrls);
    const session: PreparationSession = {
      id: ++nextPreparationSessionId,
      urls: nextUrls,
    };
    activePreparationSession = session;
    session.urls.forEach((url) => prepareIfEligible(url, session.id));
    pumpDecodeQueue();
  };

  // --- public API ---------------------------------------------------------

  return {
    getSnapshot(url) {
      return entries.get(url)?.snapshot ?? LOADING_SNAPSHOT;
    },

    observe(url) {
      const entry = observeEntry(url);
      entry.visibleOwnerCount += 1;
      // If a real DOM owner appears while an offscreen duplicate is still
      // fetching, the speculative owner is no longer useful.
      suspendWarmup(entry);

      return () => {
        if (entries.get(url) !== entry) return;
        entry.visibleOwnerCount = Math.max(0, entry.visibleOwnerCount - 1);

        const session = activePreparationSession;
        if (
          entry.visibleOwnerCount === 0 &&
          session !== null &&
          session.urls.has(url)
        ) {
          prepareIfEligible(url, session.id);
        }
      };
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

    syncPreparationWindow(preparationWindow: ImagePreparationWindow) {
      if (!canUseDom) return;

      if (!preparationWindow.enabled || preparationWindow.urls.length === 0) {
        closePreparationSession();
        return;
      }

      const session = activePreparationSession;
      if (session && matchesPreparationWindow(session, preparationWindow.urls)) {
        session.urls.forEach((url) => prepareIfEligible(url, session.id));
        pumpDecodeQueue();
        return;
      }

      openPreparationSession(preparationWindow.urls);
    },

    reportLoaded(url) {
      handleVisibleLoaded(observeEntry(url), url);
    },

    reportError(url) {
      handleVisibleError(observeEntry(url), url);
    },

    requestRetry(url) {
      if (!canUseDom) return;
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
        // `dispose()` clears this timer via `releaseEntry`, so a fired
        // callback always belongs to a live store.
        if (entry.status !== "error") return;
        // Flip to `loading` and bump the generation: the subscribed slide
        // remounts its `<img>` (new `key`) and the fresh element re-fetches.
        // Its `onLoad`/`onError` then report the real outcome back here.
        commit(entry, url, "loading", true);
      }, delay);
    },

    prune(allowed) {
      const keep = new Set(allowed);
      const session = activePreparationSession;

      entries.forEach((entry, url) => {
        if (keep.has(url)) return;
        // A live rendered owner is still on screen — never drop it.
        if (entry.visibleOwnerCount > 0) return;
        releaseEntry(entry);
        entries.delete(url);
        const queued = decodeQueue.indexOf(url);
        if (queued !== -1) decodeQueue.splice(queued, 1);
        session?.urls.delete(url);
      });
    },

    dispose() {
      // Soft, idempotent teardown: releases every heavyweight resource
      // (retry timers, warm-up `Image` handles, the idle-decode callback) and
      // empties the maps — but the store stays usable. A subsequent call to
      // `observe` / `syncPreparationWindow` / `requestRetry` simply
      // re-populates it. This mirrors `MotionController.destroy()` and is what
      // lets a React StrictMode unmount/remount reuse the same instance
      // without stranding a dead store. Call on real unmount; harmless on the
      // StrictMode fake unmount.
      cancelScheduledDecode();
      entries.forEach(releaseEntry);
      entries.clear();
      listeners.clear();
      clearDecodeQueue();
      activePreparationSession = null;
    },
  };
}
