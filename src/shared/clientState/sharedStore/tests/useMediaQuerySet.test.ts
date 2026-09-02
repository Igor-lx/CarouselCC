// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { getMediaQuerySetStore } from "../useMediaQuerySet";

/**
 * The set store exists so that the NUMBER of watched conditions never reaches
 * React's hook counter. That only holds if it behaves like the single-query
 * store it fans out to: a live read before anyone subscribes, a re-sync after
 * dormancy, and no listener left behind. Break any of those and a consumer
 * paints a stale set — the deck styled for the wrong tier, silently.
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

// Both store layers are permanent per key — unique queries keep tests isolated.
let seq = 0;
const uniqueQueries = (count: number) =>
  Array.from({ length: count }, () => `(min-width: ${5000 + seq++}px)`);

describe("getMediaQuerySetStore — the fold", () => {
  it("reads every query live on the first snapshot, before subscribing", () => {
    const mm = installMatchMedia();
    const [a, b, c] = uniqueQueries(3);
    mm.set(b!, true);
    // No subscribe yet — exactly what React does during the first render.
    expect(getMediaQuerySetStore([a!, b!, c!]).getSnapshot()).toBe("010");
  });

  it("keeps one bit per query, in the order given", () => {
    const mm = installMatchMedia();
    const [a, b] = uniqueQueries(2);
    mm.set(a!, true);
    expect(getMediaQuerySetStore([a!, b!]).getSnapshot()).toBe("10");
    expect(getMediaQuerySetStore([b!, a!]).getSnapshot()).toBe("01");
  });

  it("notifies once when a tracked query moves", () => {
    const mm = installMatchMedia();
    const [a, b] = uniqueQueries(2);
    const store = getMediaQuerySetStore([a!, b!]);
    const notify = vi.fn();
    const off = store.subscribe(notify);

    mm.fire(b!, true);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe("01");
    off();
  });

  it("gives a repeated condition its own bit, and still notifies once", () => {
    // A set may name the same condition twice (a flag repeating an
    // orientation). Both bits must answer, and the consumer must still see one
    // notification -- the fold subscribes one function, so the listener Set
    // holds it once.
    const mm = installMatchMedia();
    const [a] = uniqueQueries(1);
    const store = getMediaQuerySetStore([a!, a!]);
    const notify = vi.fn();
    const off = store.subscribe(notify);

    mm.fire(a!, true);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe("11");
    off();
  });

  it("answers all-false on the server, whatever the queries are", () => {
    installMatchMedia();
    const queries = uniqueQueries(3);
    expect(getMediaQuerySetStore(queries).getServerSnapshot()).toBe("000");
  });
});

describe("getMediaQuerySetStore — lifecycle", () => {
  it("returns the same instance for the same query list", () => {
    installMatchMedia();
    const queries = uniqueQueries(2);
    const store = getMediaQuerySetStore(queries);
    // A caller rebuilding its list per render must land on the same store,
    // or `useSyncExternalStore` would resubscribe on every render.
    expect(getMediaQuerySetStore([...queries])).toBe(store);
  });

  it("takes one listener per query and gives every one of them back", () => {
    const mm = installMatchMedia();
    const [a, b] = uniqueQueries(2);
    const off = getMediaQuerySetStore([a!, b!]).subscribe(() => {});
    expect(mm.listenerCount(a!)).toBe(1);
    expect(mm.listenerCount(b!)).toBe(1);

    off();
    expect(mm.listenerCount(a!)).toBe(0);
    expect(mm.listenerCount(b!)).toBe(0);
  });

  it("re-syncs after dormancy instead of serving what it last saw", () => {
    const mm = installMatchMedia();
    const [a, b] = uniqueQueries(2);
    const store = getMediaQuerySetStore([a!, b!]);

    const first = store.subscribe(() => {});
    expect(store.getSnapshot()).toBe("00");
    first();

    mm.set(a!, true); // moves while nobody is listening

    const second = store.subscribe(() => {});
    expect(store.getSnapshot()).toBe("10");
    second();
  });

  it("re-reads live at render time after going dormant", () => {
    // React reads the snapshot BEFORE it subscribes. A store that kept what it
    // last saw would hand that first render a stale set, and the correction
    // would only arrive on the render after the subscription.
    const mm = installMatchMedia();
    const [a, b] = uniqueQueries(2);
    const store = getMediaQuerySetStore([a!, b!]);

    const off = store.subscribe(() => {});
    expect(store.getSnapshot()).toBe("00");
    off();

    mm.set(b!, true); // silent move while nobody listens
    expect(store.getSnapshot()).toBe("01");
  });

  it("holds the set for the second subscriber when the first leaves", () => {
    const mm = installMatchMedia();
    const [a, b] = uniqueQueries(2);
    const store = getMediaQuerySetStore([a!, b!]);
    const off1 = store.subscribe(() => {});
    const notify = vi.fn();
    const off2 = store.subscribe(notify);

    off1();
    expect(mm.listenerCount(a!)).toBe(1); // still watched for the survivor

    mm.fire(a!, true);
    expect(notify).toHaveBeenCalledTimes(1);
    off2();
  });
});

describe("getMediaQuerySetStore — where the signature comes from", () => {
  it("trusts the event stream while subscribed, rather than polling the DOM", () => {
    // React compares the signature to decide whether to re-render. A signature
    // that re-read `matchMedia` on every snapshot could change with nobody
    // notified — the value moving under React unannounced.
    const mm = installMatchMedia();
    const [a, b] = uniqueQueries(2);
    const store = getMediaQuerySetStore([a!, b!]);
    const off = store.subscribe(() => undefined);
    expect(store.getSnapshot()).toBe("00");

    mm.set(a!, true); // moved, no event fired
    expect(store.getSnapshot()).toBe("00");

    mm.fire(a!, true);
    expect(store.getSnapshot()).toBe("10");
    off();
  });

  it("keeps every consumer on the same answer, whenever it joined", () => {
    // The set re-reads when it WAKES — for the first subscriber. Re-reading
    // for a later one refreshes the signature with nobody notified, and the
    // newcomer renders a different answer from the consumers already there.
    const mm = installMatchMedia();
    const [a, b] = uniqueQueries(2);
    const store = getMediaQuerySetStore([a!, b!]);
    const offFirst = store.subscribe(() => undefined);
    expect(store.getSnapshot()).toBe("00");

    mm.set(b!, true); // silent
    const offSecond = store.subscribe(() => undefined);

    expect(store.getSnapshot()).toBe("00");
    offFirst();
    offSecond();
  });

  it("does not call a listener that unsubscribed during the notification", () => {
    // Every listener is a React subscription; one unmounting while the walk is
    // in progress is ordinary, and calling it schedules work on a dead tree.
    const mm = installMatchMedia();
    const [a] = uniqueQueries(1);
    const store = getMediaQuerySetStore([a!]);

    const heard: string[] = [];
    let offSecond = (): void => undefined;
    const offFirst = store.subscribe(() => {
      heard.push("first");
      offSecond();
    });
    offSecond = store.subscribe(() => heard.push("second"));

    mm.fire(a!, true);

    expect(heard).toEqual(["first"]);
    offFirst();
  });

  it("does not call a listener that subscribed during the notification", () => {
    const mm = installMatchMedia();
    const [a] = uniqueQueries(1);
    const store = getMediaQuerySetStore([a!]);

    const heard: string[] = [];
    const off = store.subscribe(() => {
      heard.push("first");
      store.subscribe(() => heard.push("late"));
    });

    mm.fire(a!, true);

    expect(heard).toEqual(["first"]);
    off();
  });
});
