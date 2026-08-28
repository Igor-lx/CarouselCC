// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useMedia } from "../useMedia";
import type { MediaState } from "../useMedia";
import type { MediaAxes } from "../internal/canonicalMedia";

/**
 * The reactive half of the media facade (its pure derivation is covered next
 * door, in `useMedia.test.ts`).
 *
 * Two things here are load-bearing and neither is obvious from the signature.
 * `signature` is the ONE value consumers compare to decide whether anything
 * moved; a signature that changes when nothing did re-runs every dependent
 * effect on the page, and one that fails to change when a tier flips leaves
 * the deck styled for the wrong breakpoint. And the hook calls
 * `useSyncExternalStore` in a LOOP over the axes, so the axes object has to be
 * a stable module constant — a fresh one per render changes the hook count
 * between renders, which React cannot survive.
 */

const AXES: MediaAxes = {
  breakpoints: { desktop: 1024, tablet: 768, mobile: 0 },
  flags: { "short-landscape": "(orientation: landscape) and (max-height: 520px)" },
};

type MediaListener = (event: { matches: boolean }) => void;

interface Entry {
  matches: boolean;
  listeners: Set<MediaListener>;
}

/**
 * Module-scoped on purpose. The shared store caches one MediaQueryList per
 * query for the process, so a registry rebuilt per test would be invisible to
 * every query the store had already seen.
 */
const registry = new Map<string, Entry>();

let host: HTMLDivElement;
let root: Root;
let seen: MediaState;
let renders: number;

const entryOf = (query: string): Entry => {
  let entry = registry.get(query);
  if (!entry) {
    entry = { matches: false, listeners: new Set() };
    registry.set(query, entry);
  }
  return entry;
};

const installMatchMedia = () => {
  vi.stubGlobal("matchMedia", (query: string) => {
    const entry = entryOf(query);
    return {
      media: query,
      get matches() {
        return entry.matches;
      },
      addEventListener: (_: string, cb: MediaListener) =>
        entry.listeners.add(cb),
      removeEventListener: (_: string, cb: MediaListener) =>
        entry.listeners.delete(cb),
    };
  });
};

/** Flip a query the way the browser would, and let React settle. */
const flip = (query: string, matches: boolean) => {
  const entry = entryOf(query);
  entry.matches = matches;
  act(() => {
    entry.listeners.forEach((listener) => listener({ matches }));
  });
};

const queryFor = (name: string): string => {
  for (const key of registry.keys()) if (key.includes(name)) return key;
  throw new Error(`no registered query mentions "${name}"`);
};

function Probe() {
  renders += 1;
  seen = useMedia(AXES);
  return null;
}

const render = () =>
  act(() => {
    root.render(<Probe />);
  });

beforeEach(() => {
  // Reset the verdicts, keep the entries: see the note on `registry`.
  registry.forEach((entry) => {
    entry.matches = false;
  });
  renders = 0;
  installMatchMedia();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("useMedia — resolving the axes", () => {
  it("falls back to the narrowest tier when nothing matches", () => {
    render();
    expect(seen.breakpoint).toBe("mobile");
  });

  it("resolves to the tier whose query matches", () => {
    render();
    flip(queryFor("1024"), true);
    expect(seen.breakpoint).toBe("desktop");
  });

  it("prefers the WIDEST matching tier when several match at once", () => {
    render();
    flip(queryFor("768"), true);
    expect(seen.breakpoint).toBe("tablet");

    flip(queryFor("1024"), true);
    expect(seen.breakpoint).toBe("desktop");
  });

  it("exposes every declared flag, on or off", () => {
    render();
    expect(seen.flags["short-landscape"]).toBe(false);

    flip(queryFor("max-height: 520px"), true);
    expect(seen.flags["short-landscape"]).toBe(true);
  });
});

describe("useMedia — the signature", () => {
  it("changes when a tracked verdict changes", () => {
    render();
    const before = seen.signature;
    flip(queryFor("1024"), true);
    expect(seen.signature).not.toBe(before);
  });

  it("does NOT change when a re-render moves nothing", () => {
    render();
    const before = seen.signature;
    render();
    render();
    expect(seen.signature).toBe(before);
  });

  it("holds the same object identity while the signature holds", () => {
    // Consumers put this straight into dependency arrays.
    render();
    const before = seen;
    render();
    expect(seen).toBe(before);
  });

  it("returns a NEW object once the signature moves", () => {
    render();
    const before = seen;
    flip(queryFor("1024"), true);
    expect(seen).not.toBe(before);
  });

  it("does not re-render the consumer for a query it does not track", () => {
    render();
    const before = renders;
    // A query outside the axes: nobody subscribed to it, so nothing happens.
    entryOf("(min-width: 3000px)").matches = true;
    act(() => {});
    expect(renders).toBe(before);
  });
});

describe("useMedia — matches()", () => {
  it("answers live for a query outside the axes", () => {
    render();
    const query = "(min-width: 2000px)";
    expect(seen.matches(query)).toBe(false);

    entryOf(query).matches = true;
    expect(seen.matches(query)).toBe(true);
  });

  it("agrees with the resolved axes for a query inside them", () => {
    render();
    flip(queryFor("1024"), true);
    expect(seen.matches(queryFor("1024"))).toBe(true);
  });
});

describe("useMedia — teardown", () => {
  it("releases every listener it took", () => {
    render();
    const taken = [...registry.values()].reduce(
      (total, entry) => total + entry.listeners.size,
      0,
    );
    expect(taken).toBeGreaterThan(0);

    act(() => root.unmount());
    root = createRoot(host);

    const left = [...registry.values()].reduce(
      (total, entry) => total + entry.listeners.size,
      0,
    );
    expect(left).toBe(0);
  });
});
