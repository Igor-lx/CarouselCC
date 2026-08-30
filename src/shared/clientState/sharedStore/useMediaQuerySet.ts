// See ./README.md
import { useSyncExternalStore } from "react";

import { getMediaQueryStore } from "./useMediaQuery";

/**
 * Many conditions, ONE subscription.
 *
 * The obvious way to watch a set of media queries is to call `useMediaQuery`
 * once per query, in a loop. That ties the NUMBER OF HOOKS to the LENGTH OF
 * THE DATA: a set that gains a condition between renders changes the hook
 * count, and React answers that with an error naming neither the hook nor the
 * set. Folding the set into one store removes the failure instead of
 * documenting it — a caller may build its query list any way it likes.
 *
 * The snapshot is a STRING of one bit per query, so React compares it by
 * value and no caching contract leaks to the caller.
 */
export interface MediaQuerySetStore {
  /** The tracked conditions, in signature-bit order. */
  readonly queries: readonly string[];
  getSnapshot: () => string;
  getServerSnapshot: () => string;
  subscribe: (callback: () => void) => () => void;
}

const createSetStore = (queries: readonly string[]): MediaQuerySetStore => {
  const serverSignature = "0".repeat(queries.length);
  const listeners = new Set<() => void>();
  let release: Array<() => void> = [];
  let signature = serverSignature;
  let initialized = false;

  const read = (): string => {
    let bits = "";
    for (const query of queries) {
      bits += getMediaQueryStore(query).getSnapshot() ? "1" : "0";
    }
    return bits;
  };

  // Fold the whole set again rather than patching one bit, so this callback
  // needs no argument and no identity: a set that lists the same condition
  // twice subscribes ONE function to that condition's store, and a Set of
  // listeners keeps it once. The equality check below is then belt-and-braces
  // -- every arrival today carries a real change, because the per-query store
  // already drops events that move nothing -- and it is what lets the fold
  // stay correct if that ever stops being true.
  const onQueryChange = () => {
    const next = read();
    if (next === signature) return;
    signature = next;
    // Snapshot + membership: a listener that subscribes during this
    // notification must not receive it, and one that unsubscribes during it
    // must not be called after the fact.
    for (const listener of [...listeners]) {
      if (listeners.has(listener)) listener();
    }
  };

  return {
    queries,
    getSnapshot() {
      if (!initialized) {
        signature = read();
        initialized = true;
      }
      return signature;
    },
    getServerSnapshot: () => serverSignature,
    subscribe(callback) {
      listeners.add(callback);

      if (listeners.size === 1) {
        // First (or first-after-dormancy) subscriber: attach, then re-sync —
        // the set may have moved while nobody was listening.
        release = queries.map((query) =>
          getMediaQueryStore(query).subscribe(onQueryChange),
        );
        signature = read();
        initialized = true;
      }

      return () => {
        listeners.delete(callback);
        if (listeners.size === 0) {
          for (const off of release) off();
          release = [];
          initialized = false; // dormant -> next consumer re-reads live
        }
      };
    },
  };
};

// Keyed by the query list, not by array identity, so a caller that rebuilds
// its list every render still lands on one store.
const stores = new Map<string, MediaQuerySetStore>();

export const getMediaQuerySetStore = (
  queries: readonly string[],
): MediaQuerySetStore => {
  const key = queries.join("\n");
  let store = stores.get(key);
  if (!store) {
    store = createSetStore([...queries]);
    stores.set(key, store);
  }
  return store;
};

/** One bit per query, in the order given — changes iff a tracked verdict does. */
export function useMediaQuerySet(queries: readonly string[]): string {
  const store = getMediaQuerySetStore(queries);
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
}
