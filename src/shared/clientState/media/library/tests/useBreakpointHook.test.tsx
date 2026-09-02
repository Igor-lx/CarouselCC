// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  resolveActiveBreakpoint,
  useBreakpoint,
  type BreakpointState,
  type BreakpointTable,
} from "../useBreakpoint";

/**
 * The HOOK, as opposed to the pure resolver its neighbour file already pins.
 *
 * Nothing had ever rendered it: the tier-plan cache, the resolution over the
 * subscription signature and the `pick` API had no coverage at all. The
 * resolver is exported so "non-React consumers share the exact resolution
 * semantics of the hook" — but the hook does not call it. It resolves a second
 * way, by index into the signature, and the two agreeing is held by
 * construction and a comment. The first block below holds them to it instead.
 */

const TABLE: BreakpointTable = { desktop: 1024, tablet: 768, mobile: 0 };
/** Deliberately shuffled and custom-named: resolution is numeric, not textual. */
const SHUFFLED: BreakpointTable = { melko: 0, shiroko: 2200, sredne: 1024 };

/** A viewport of the given width, as a min-width matcher. */
const viewport = (width: number) => (query: string) => {
  const px = Number(/\(min-width: (\d+)px\)/.exec(query)?.[1]);
  return Number.isFinite(px) && width >= px;
};

let width: number;
let host: HTMLDivElement;
let root: Root;
let seen: BreakpointState[];

interface Registered {
  query: string;
  listener: (event: MediaQueryListEvent) => void;
}
const mediaListeners = new Set<Registered>();

const installMatchMedia = () => {
  // Deliberately NOT cleared between tests: the shared media store caches one
  // MediaQueryList per query string for the life of the module, so a listener
  // it registered in an earlier test is still the live one.
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return viewport(width)(query);
    },
    addEventListener: (
      _type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      mediaListeners.add({ query, listener });
    },
    removeEventListener: (
      _type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      for (const entry of [...mediaListeners])
        if (entry.listener === listener) mediaListeners.delete(entry);
    },
  }));
};

/** Resize the window under a mounted consumer. */
const resizeTo = (next: number) => {
  width = next;
  act(() => {
    // Each listener hears about ITS OWN query, the way the browser reports it.
    for (const { query, listener } of [...mediaListeners])
      listener({ matches: viewport(next)(query) } as MediaQueryListEvent);
  });
};

/** A caller that rebuilds its table object on EVERY render, as allowed. */
function Probe({ table }: { table: BreakpointTable }) {
  seen.push(useBreakpoint({ ...table }));
  return null;
}

const render = (table: BreakpointTable) => {
  act(() => {
    root.render(<Probe table={table} />);
  });
  return seen[seen.length - 1]!;
};

beforeEach(() => {
  width = 1920;
  seen = [];
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

describe("useBreakpoint agrees with the resolver it publishes", () => {
  it("picks the same tier as the pure resolver, at every width", () => {
    // The two are separate implementations of one rule. Diagnostics and
    // `<source media>` read the pure one; the deck reads the hook. A drift
    // between them shows up as a carousel laid out for one tier and images
    // chosen for another.
    for (const table of [TABLE, SHUFFLED]) {
      for (const at of [320, 767, 768, 1023, 1024, 2199, 2200, 3840]) {
        width = at;
        act(() => root.unmount());
        root = createRoot(host);
        seen = [];

        expect(render(table).name).toBe(
          resolveActiveBreakpoint(table, viewport(at)),
        );
      }
    }
  });

  it("falls back to the narrowest tier when nothing matches", () => {
    width = 100;
    expect(render({ desktop: 1024, tablet: 768 }).name).toBe("tablet");
  });

  it("resolves an empty table to an empty name", () => {
    expect(render({}).name).toBe("");
  });
});

describe("useBreakpoint — picking a value for the active tier", () => {
  it("takes the active tier's value when there is one", () => {
    width = 800;
    expect(render(TABLE).pick({ tablet: 2, desktop: 3 })).toBe(2);
  });

  it("falls back to DEFAULT when the active tier has no value", () => {
    // The point of the fallback: a caller lists the tiers that differ and one
    // value for the rest, instead of repeating itself per tier.
    width = 800;
    expect(render(TABLE).pick({ desktop: 3, DEFAULT: 1 })).toBe(1);
  });

  it("gives back nothing when neither the tier nor DEFAULT is listed", () => {
    // `undefined` is an answer, not a crash: the caller decides what an
    // unlisted tier means.
    width = 800;
    expect(render(TABLE).pick({ desktop: 3 })).toBeUndefined();
  });

  it("prefers the tier's own value over DEFAULT", () => {
    width = 1920;
    expect(render(TABLE).pick({ desktop: 3, DEFAULT: 1 })).toBe(3);
  });
});

describe("useBreakpoint — the tier plan is cached by SHAPE", () => {
  it("hands back the same state when a rebuilt table means the same thing", () => {
    // The Probe builds a fresh table object every render, which is explicitly
    // allowed. Re-planning on object identity would rebuild the query list and
    // re-subscribe the whole set on every render of every consumer.
    const first = render(TABLE);
    const second = render(TABLE);

    expect(second).toBe(first);
  });

  it("re-plans when the table's meaning actually changes", () => {
    const first = render(TABLE);
    const widened = render({ ...TABLE, desktop: 3000 });

    expect(widened).not.toBe(first);
    // 1920 no longer reaches the desktop tier.
    expect(first.name).toBe("desktop");
    expect(widened.name).toBe("tablet");
  });
});

describe("useBreakpoint — the viewport moving under a mounted consumer", () => {
  it("re-resolves the tier when the window is resized", () => {
    // The whole reason the hook subscribes at all. Resolving once at mount
    // leaves a rotated phone or a dragged window laid out for the tier it
    // started in, with no way back until something else re-renders it.
    expect(render(TABLE).name).toBe("desktop");

    resizeTo(800);
    expect(seen[seen.length - 1]!.name).toBe("tablet");

    resizeTo(390);
    expect(seen[seen.length - 1]!.name).toBe("mobile");

    resizeTo(1920);
    expect(seen[seen.length - 1]!.name).toBe("desktop");
  });

  it("keeps the state object identical while the tier holds", () => {
    // Two widths inside one tier are the same answer; handing back a fresh
    // object would re-render every consumer of it on each resize frame.
    expect(render(TABLE).name).toBe("desktop");
    const atStart = seen[seen.length - 1]!;

    resizeTo(1600);

    expect(seen[seen.length - 1]!).toBe(atStart);
  });
});
