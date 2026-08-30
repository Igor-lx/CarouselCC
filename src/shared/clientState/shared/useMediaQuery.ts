// See ./README.md for the lifecycle contract (each rule closes a real failure mode).
import { useSyncExternalStore } from "react";

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
    // Snapshot + membership: a listener that subscribes during this
    // notification must not receive it, and one that unsubscribes during it
    // must not be called after the fact.
    for (const listener of [...listeners]) {
      if (listeners.has(listener)) listener();
    }
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
        // First (or first-after-dormancy) subscriber: re-sync + attach.
        matches = read();
        initialized = true;
        mediaQuery?.addEventListener("change", onChange);
      }

      return () => {
        listeners.delete(callback);
        if (listeners.size === 0) {
          mediaQuery?.removeEventListener("change", onChange);
          initialized = false; // dormant → next consumer re-reads live
        }
      };
    },
  };
};

/** The raw per-query store behind {@link useMediaQuery} (deep import only). */
export const getMediaQueryStore = (query: string): MediaQueryStore => {
  let store = stores.get(query);
  if (!store) {
    store = createStore(query);
    stores.set(query, store);
  }
  return store;
};

const getServerSnapshot = () => false;

/** Whether a CSS media query currently matches (live, shared listener). */
export function useMediaQuery(query: string): boolean {
  const store = getMediaQueryStore(query);
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    getServerSnapshot,
  );
}
