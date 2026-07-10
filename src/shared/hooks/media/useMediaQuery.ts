import { useSyncExternalStore } from "react";

/**
 * One shared store per distinct query string: every component subscribed to
 * the same query shares a single `MediaQueryList` listener, and the store
 * exposes referentially stable `subscribe` / `getSnapshot` functions so
 * `useSyncExternalStore` never resubscribes on re-render. A store tears
 * itself down (and is dropped from the map) when its last subscriber leaves,
 * so a later re-subscribe re-reads the live `matchMedia` state cleanly —
 * mirroring the teardown contract of the other module-store hooks.
 */

interface MediaQueryStore {
  subscribe: (callback: () => void) => () => void;
  getSnapshot: () => boolean;
}

const stores = new Map<string, MediaQueryStore>();

const createStore = (query: string): MediaQueryStore => {
  let matches = false;
  let mediaQuery: MediaQueryList | null = null;
  const listeners = new Set<() => void>();

  const onChange = (event: MediaQueryListEvent) => {
    if (matches === event.matches) return;
    matches = event.matches;
    listeners.forEach((listener) => listener());
  };

  return {
    getSnapshot: () => matches,
    subscribe(callback) {
      listeners.add(callback);

      if (!mediaQuery && typeof window !== "undefined") {
        mediaQuery = window.matchMedia(query);
        matches = mediaQuery.matches;
        mediaQuery.addEventListener("change", onChange);
      }

      return () => {
        listeners.delete(callback);
        if (listeners.size === 0) {
          mediaQuery?.removeEventListener("change", onChange);
          // Drop the whole store so the next subscriber starts fresh from a
          // live matchMedia read.
          stores.delete(query);
        }
      };
    },
  };
};

const getStore = (query: string): MediaQueryStore => {
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
  const store = getStore(query);
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    getServerSnapshot
  );
}
