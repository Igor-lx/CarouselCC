// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { getMediaQueryStore } from "../useMediaQuery";

/**
 * Lifecycle contract of the shared media-query store. Break any of the three
 * and dev/StrictMode resolves every query to `false` — a deck rendering the
 * MOBILE tier on desktop, with nothing reported:
 *  1. the render-time snapshot read BEFORE any subscription must be live;
 *  2. a re-subscribe after a full teardown must re-attach the listener;
 *  3. a teardown must never poison a later consumer of the same query.
 */

const installMatchMedia = () => {
  const registry = new Map<string, { matches: boolean; listeners: Set<(e: { matches: boolean }) => void> }>();

  const entryOf = (query: string) => {
    let entry = registry.get(query);
    if (!entry) {
      entry = { matches: false, listeners: new Set() };
      registry.set(query, entry);
    }
    return entry;
  };

  vi.stubGlobal("matchMedia", (query: string) => {
    const entry = entryOf(query);
    return {
      get matches() {
        return entry.matches;
      },
      addEventListener: (_: string, cb: (e: { matches: boolean }) => void) =>
        entry.listeners.add(cb),
      removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) =>
        entry.listeners.delete(cb),
    };
  });

  return {
    set(query: string, matches: boolean) {
      entryOf(query).matches = matches;
    },
    fire(query: string, matches: boolean) {
      const entry = entryOf(query);
      entry.matches = matches;
      entry.listeners.forEach((cb) => cb({ matches }));
    },
    listenerCount(query: string) {
      return entryOf(query).listeners.size;
    },
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

// Stores are permanent per query — use a unique query per test for isolation.
let seq = 0;
const uniqueQuery = () => `(min-width: ${1000 + seq++}px)`;

describe("getMediaQueryStore lifecycle", () => {
  it("getSnapshot reads matchMedia live on first call, before any subscription", () => {
    const mm = installMatchMedia();
    const query = uniqueQuery();
    mm.set(query, true);
    const store = getMediaQueryStore(query);
    // No subscribe yet — exactly what React does during the first render.
    expect(store.getSnapshot()).toBe(true);
  });

  it("returns the same permanent instance for the same query", () => {
    installMatchMedia();
    const query = uniqueQuery();
    const store = getMediaQueryStore(query);
    const unsubscribe = store.subscribe(() => {});
    unsubscribe(); // full teardown
    expect(getMediaQueryStore(query)).toBe(store);
  });

  it("re-subscribe after a full teardown re-attaches the listener and re-syncs", () => {
    const mm = installMatchMedia();
    const query = uniqueQuery();
    mm.set(query, true);
    const store = getMediaQueryStore(query);

    const first = store.subscribe(() => {});
    expect(mm.listenerCount(query)).toBe(1);
    first();
    expect(mm.listenerCount(query)).toBe(0);

    // Value moves while dormant — no listener saw it.
    mm.set(query, false);

    const notify = vi.fn();
    const second = store.subscribe(notify);
    expect(mm.listenerCount(query)).toBe(1); // listener is back
    expect(store.getSnapshot()).toBe(false); // re-synced from live value

    mm.fire(query, true); // and the change stream works again
    expect(notify).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe(true);
    second();
  });

  it("dormant store re-reads live on the next render-time getSnapshot", () => {
    const mm = installMatchMedia();
    const query = uniqueQuery();
    mm.set(query, true);
    const store = getMediaQueryStore(query);
    const unsubscribe = store.subscribe(() => {});
    expect(store.getSnapshot()).toBe(true);
    unsubscribe();

    mm.set(query, false); // silent move while nobody listens
    expect(store.getSnapshot()).toBe(false);
  });

  it("StrictMode sequence (subscribe/teardown/resubscribe + later renders) stays live", () => {
    const mm = installMatchMedia();
    const query = uniqueQuery();
    mm.set(query, true);

    // mount effect -> strict cleanup -> strict re-subscribe
    const s1 = getMediaQueryStore(query);
    const a = s1.subscribe(() => {});
    a();
    const b = s1.subscribe(() => {});

    // a later render resolves the store again — must be the same live one
    const s2 = getMediaQueryStore(query);
    expect(s2).toBe(s1);
    expect(s2.getSnapshot()).toBe(true);

    // the old unsubscribe path must not detach the active subscription
    const notify = vi.fn();
    const c = s2.subscribe(notify);
    b();
    mm.fire(query, false);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(s2.getSnapshot()).toBe(false);
    c();
  });
});
