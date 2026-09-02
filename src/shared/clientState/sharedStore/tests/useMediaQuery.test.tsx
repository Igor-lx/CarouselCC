// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { act } from "react";
import { createRoot } from "react-dom/client";

import { getMediaQueryStore, useMediaQuery } from "../useMediaQuery";

/**
 * Lifecycle contract of the shared media-query store. Break any of the three
 * and dev/StrictMode resolves every query to `false` — a deck rendering the
 * MOBILE tier on desktop, with nothing reported:
 *  1. the render-time snapshot read BEFORE any subscription must be live;
 *  2. a re-subscribe after a full teardown must re-attach the listener;
 *  3. a teardown must never poison a later consumer of the same query.
 */

const installMatchMedia = () => {
  const registry = new Map<
    string,
    { matches: boolean; listeners: Set<(e: { matches: boolean }) => void> }
  >();

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

describe("getMediaQueryStore — one listener for many consumers", () => {
  it("attaches once however many subscribe, and lets go at the last", () => {
    // The store is shared per query string for the life of the module. One
    // browser listener per consumer would mean a listener per mounted
    // carousel, per breakpoint, for as long as the page lives.
    const mm = installMatchMedia();
    const query = uniqueQuery();
    const store = getMediaQueryStore(query);

    const offA = store.subscribe(() => undefined);
    const offB = store.subscribe(() => undefined);
    expect(mm.listenerCount(query)).toBe(1);

    offA();
    expect(mm.listenerCount(query)).toBe(1); // B still needs it

    offB();
    expect(mm.listenerCount(query)).toBe(0);
  });

  it("keeps serving the consumers that stayed", () => {
    const mm = installMatchMedia();
    const query = uniqueQuery();
    const store = getMediaQueryStore(query);

    let heard = 0;
    const offA = store.subscribe(() => undefined);
    store.subscribe(() => {
      heard += 1;
    });
    offA();

    mm.fire(query, true);

    expect(heard).toBe(1);
    expect(store.getSnapshot()).toBe(true);
  });
});

describe("getMediaQueryStore — what a change event does", () => {
  it("says nothing when the query fires without actually changing", () => {
    // Browsers repeat the event; so does a second MediaQueryList on the same
    // string. Re-notifying re-renders every consumer of a value that did not
    // move.
    const mm = installMatchMedia();
    const query = uniqueQuery();
    const store = getMediaQueryStore(query);

    let heard = 0;
    store.subscribe(() => {
      heard += 1;
    });

    mm.fire(query, true);
    expect(heard).toBe(1);

    mm.fire(query, true);
    expect(heard).toBe(1);

    mm.fire(query, false);
    expect(heard).toBe(2);
  });

  it("does not call a listener that unsubscribed during the notification", () => {
    // Every listener is a React subscription, and a consumer unmounting while
    // the notification walks the set is ordinary. Calling it anyway schedules
    // an update on a tree that is gone.
    const mm = installMatchMedia();
    const query = uniqueQuery();
    const store = getMediaQueryStore(query);

    const heard: string[] = [];
    let offSecond = (): void => undefined;
    store.subscribe(() => {
      heard.push("first");
      offSecond();
    });
    offSecond = store.subscribe(() => heard.push("second"));

    mm.fire(query, true);

    expect(heard).toEqual(["first"]);
  });

  it("does not call a listener that subscribed during the notification", () => {
    // The mirror: a listener added mid-walk never saw the old value, so the
    // notification it would get is about nothing.
    const mm = installMatchMedia();
    const query = uniqueQuery();
    const store = getMediaQueryStore(query);

    const heard: string[] = [];
    store.subscribe(() => {
      heard.push("first");
      store.subscribe(() => heard.push("late"));
    });

    mm.fire(query, true);

    expect(heard).toEqual(["first"]);
  });
});

describe("getMediaQueryStore — where the snapshot comes from", () => {
  it("trusts the event stream while subscribed, rather than polling the DOM", () => {
    // React compares snapshots to decide whether to re-render. A snapshot that
    // polls `matchMedia` could change WITHOUT a notification — the value moves
    // under React with nobody telling it, which is exactly the tear
    // `useSyncExternalStore` exists to prevent.
    const mm = installMatchMedia();
    const query = uniqueQuery();
    const store = getMediaQueryStore(query);
    store.subscribe(() => undefined);
    expect(store.getSnapshot()).toBe(false);

    mm.set(query, true); // moved, but no event fired

    expect(store.getSnapshot()).toBe(false);

    mm.fire(query, true);
    expect(store.getSnapshot()).toBe(true);
  });

  it("keeps every consumer on the same answer, whenever it joined", () => {
    // The store re-reads when it WAKES — for the first subscriber. Re-reading
    // for a later one refreshes the value with nobody notified, and the
    // newcomer renders a different answer from the consumers already there.
    const mm = installMatchMedia();
    const query = uniqueQuery();
    const store = getMediaQueryStore(query);

    store.subscribe(() => undefined);
    expect(store.getSnapshot()).toBe(false);

    mm.set(query, true); // silent again
    store.subscribe(() => undefined);

    expect(store.getSnapshot()).toBe(false);
  });
});

describe("useMediaQuery — the hook over that store", () => {
  it("reports the live answer on the FIRST render, then follows it", () => {
    // The hook body itself had no test: everything above drives the store
    // directly. A first render that answers `false` on a matching query is
    // exactly the failure the store's lifecycle exists to prevent, and it has
    // to survive the trip through `useSyncExternalStore` too.
    const mm = installMatchMedia();
    const query = uniqueQuery();
    mm.set(query, true);

    const seen: boolean[] = [];
    const Probe = () => {
      seen.push(useMediaQuery(query));
      return null;
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => root.render(<Probe />));
    expect(seen[0]).toBe(true);

    act(() => mm.fire(query, false));
    expect(seen.at(-1)).toBe(false);

    act(() => root.unmount());
    host.remove();
    expect(mm.listenerCount(query)).toBe(0);
  });
});
