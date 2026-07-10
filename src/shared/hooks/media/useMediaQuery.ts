import { useSyncExternalStore } from "react";

/**
 * One shared store per distinct query string: every component subscribed to
 * the same query shares a single `MediaQueryList` listener, and the store
 * exposes referentially stable `subscribe` / `getSnapshot` functions so
 * `useSyncExternalStore` never resubscribes on re-render.
 *
 * Lifecycle contract (each rule closes a real failure mode):
 * - `getSnapshot` performs a LAZY LIVE read on its first call: React reads
 *   the snapshot during render, BEFORE it subscribes — a cached `false`
 *   there would paint the wrong layout for the first frame.
 * - The store is a PERMANENT per-query singleton — it is never removed from
 *   the map. Deleting it on last-unsubscribe poisoned StrictMode/dev: hook
 *   instances keep references to the store captured at render time, so a
 *   delete-by-query could tear down a NEWER store created for the same query
 *   between renders, and every render then minted another fresh
 *   `matches: false` store — the layout oscillated and stuck on the mobile
 *   tier. The set of distinct queries in an app is small and fixed; keeping
 *   the entries is free.
 * - Attach/detach is gated on the subscriber COUNT (not on whether the
 *   MediaQueryList exists): a re-subscribe after a full teardown must
 *   re-attach the change listener and re-sync from the live value, which a
 *   `!mediaQuery` gate silently skipped. While dormant, `initialized` drops
 *   so the next consumer starts from a fresh live read.
 */

interface MediaQueryStore {
  subscribe: (callback: () => void) => () => void;
  getSnapshot: () => boolean;
}

const stores = new Map<string, MediaQueryStore>();

const createStore = (query: string): MediaQueryStore => {
  const listeners = new Set<() => void>();
  let mediaQuery: MediaQueryList | null = null;
  let matches = false;
  let initialized = false;

  const read = (): boolean => {
    if (typeof window === "undefined") return false;
    mediaQuery ??= window.matchMedia(query);
    return mediaQuery.matches;
  };

  const onChange = (event: MediaQueryListEvent) => {
    if (matches === event.matches) return;
    matches = event.matches;
    listeners.forEach((listener) => listener());
  };

  return {
    getSnapshot() {
      if (!initialized) {
        matches = read();
        initialized = true;
      }
      return matches;
    },
    subscribe(callback) {
      listeners.add(callback);

      if (listeners.size === 1 && typeof window !== "undefined") {
        // First (or first-after-dormancy) subscriber: re-sync from the live
        // value and attach the shared change listener.
        matches = read();
        initialized = true;
        mediaQuery?.addEventListener("change", onChange);
      }

      return () => {
        listeners.delete(callback);
        if (listeners.size === 0) {
          mediaQuery?.removeEventListener("change", onChange);
          // Dormant: no listener keeps `matches` fresh any more, so force the
          // next consumer (subscribe OR render-time getSnapshot) to re-read.
          initialized = false;
        }
      };
    },
  };
};

/**
 * The raw store behind {@link useMediaQuery} — one permanent instance per
 * query. Exposed (deep import only, not via the shared barrel) for non-React
 * consumers and for the lifecycle regression tests.
 */
export const getMediaQueryStore = (query: string): MediaQueryStore => {
  let store = stores.get(query);
  if (!store) {
    store = createStore(query);
    stores.set(query, store);
  }
  return store;
};

const getServerSnapshot = () => false;

/**
 * Reports whether a CSS media query currently matches. The generic module
 * store behind `useIsReducedMotion`, `useBreakpoint`, `useCompactLandscape` —
 * and the single way to subscribe to any other query without hand-rolling
 * another store. Backed by `useSyncExternalStore` (SSR/hydration handled via
 * the `false` server snapshot).
 */
export function useMediaQuery(query: string): boolean {
  const store = getMediaQueryStore(query);
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    getServerSnapshot,
  );
}
