// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { VirtualSlide } from "../../domain";
import { createImageResourceStore } from "../imageResource";
import type { ImageResourceStore } from "../imageResource";
import { useSlideFetchReach } from "../useSlideFetchReach";

/**
 * How far outside the visible band a slide may fetch. Three properties carry
 * the design and each is a measured regression when broken:
 *
 *  - the buffer waits for the band, so the slide being looked at gets the
 *    bandwidth first;
 *  - it also waits for the deck to be STILL. Opening mounts an `<img>` into
 *    every buffered slide at once, and the band settles about a second after
 *    mount — inside the user's first ride — so without this condition that
 *    whole commit, fetch and decode lands in the frames of the first movement.
 *    What remains unavoidable is the page being ridden to;
 *  - the reach LATCHES open. A retry cycles a status back to `loading`, and a
 *    reach that reopened on `loaded` alone would slam shut mid-cycle, unmount
 *    the buffer and throw its in-flight fetches away.
 */

const BAND_ONLY = 0;

let host: HTMLDivElement;
let root: Root;
let store: ImageResourceStore;

const slide = (src: string, isActual: boolean): VirtualSlide => ({
  slideKey: src,
  slideData: { id: src, content: src },
  virtualIndex: 0,
  isActive: isActual,
  isActual,
  ariaProps: {},
});

let observed = BAND_ONLY;

function Probe({
  virtualSlides,
  isIdle = true,
}: {
  virtualSlides: VirtualSlide[];
  isIdle?: boolean;
}) {
  observed = useSlideFetchReach({
    virtualSlides,
    isContentImg: true,
    isResponsiveImagesOn: true,
    imageResourceStore: store,
    isIdle,
  });
  return null;
}

const render = (virtualSlides: VirtualSlide[], isIdle = true): void => {
  act(() => {
    root.render(<Probe virtualSlides={virtualSlides} isIdle={isIdle} />);
  });
};

/** The buffer is open when the reach covers every lane the window holds. */
const isBufferOpen = () => observed === Number.POSITIVE_INFINITY;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  store = createImageResourceStore();
  observed = BAND_ONLY;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  store.dispose();
});

describe("useSlideFetchReach — waiting for the band", () => {
  it("holds the buffer back until the band reports", () => {
    render([slide("a.webp", true), slide("b.webp", false)]);
    expect(observed).toBe(BAND_ONLY);

    act(() => store.reportLoaded("a.webp"));
    expect(isBufferOpen()).toBe(true);
  });

  it("waits for EVERY slide of a multi-slide band", () => {
    render([
      slide("a.webp", true),
      slide("b.webp", true),
      slide("c.webp", false),
    ]);

    act(() => store.reportLoaded("a.webp"));
    expect(observed).toBe(BAND_ONLY);

    act(() => store.reportLoaded("b.webp"));
    expect(isBufferOpen()).toBe(true);
  });

  it("opens on error too — a broken image is not a hostage taker", () => {
    render([slide("a.webp", true), slide("b.webp", false)]);
    act(() => store.reportError("a.webp"));
    expect(isBufferOpen()).toBe(true);
  });

  it("reaches everywhere when the band carries no images at all", () => {
    render([]);
    expect(isBufferOpen()).toBe(true);
  });
});

describe("useSlideFetchReach — waiting for stillness", () => {
  it("does NOT open while the deck is moving, however loaded the band is", () => {
    render([slide("a.webp", true), slide("b.webp", false)], false);
    act(() => store.reportLoaded("a.webp"));

    // Opening here mounts the whole buffer into a moving track: the commit,
    // the fetches and their decodes all land in frames being animated.
    expect(observed).toBe(BAND_ONLY);
  });

  it("opens at the first rest after the ride", () => {
    render([slide("a.webp", true), slide("b.webp", false)], false);
    act(() => store.reportLoaded("a.webp"));
    expect(observed).toBe(BAND_ONLY);

    render([slide("a.webp", true), slide("b.webp", false)], true);
    expect(isBufferOpen()).toBe(true);
  });

  it("stays open once open, even when the deck moves again", () => {
    render([slide("a.webp", true), slide("b.webp", false)]);
    act(() => store.reportLoaded("a.webp"));
    expect(isBufferOpen()).toBe(true);

    // Shrinking would unmount the buffer mid-ride: the same commit again, with
    // the bytes thrown away as well.
    render([slide("a.webp", true), slide("b.webp", false)], false);
    expect(isBufferOpen()).toBe(true);
  });
});

describe("useSlideFetchReach — the latch", () => {
  it("stays open while a retry cycles the status back to loading", () => {
    render([slide("a.webp", true)]);
    act(() => store.reportError("a.webp"));
    expect(isBufferOpen()).toBe(true);

    act(() => store.requestRetry("a.webp"));
    render([slide("a.webp", true)]);
    expect(isBufferOpen()).toBe(true);
  });

  it("does not re-subscribe when the band's URLs are unchanged", () => {
    // `virtualSlides` is a fresh array on every dispatch — twice per ride — but
    // the band's URLs change at most once. Keying on array identity tore down
    // and rebuilt N store subscriptions in the click frame.
    let subscriptions = 0;
    const real = store;
    store = {
      ...real,
      subscribe: (url, listener) => {
        subscriptions += 1;
        return real.subscribe(url, listener);
      },
    };

    render([slide("a.webp", true), slide("b.webp", false)]);
    const afterFirst = subscriptions;
    render([slide("a.webp", true), slide("b.webp", false)]);
    expect(subscriptions).toBe(afterFirst);

    store = real;
  });
});

/**
 * The fourth property, and the one no test held: the band's URL list has to
 * keep its IDENTITY while its contents are the same.
 *
 * `virtualSlides` is a fresh array on every dispatch — twice per ride at the
 * very least — so a list rebuilt each time would tear down and rebuild one
 * store subscription per band slide on every one of them, and re-run the
 * settle evaluation with it. The latch that holds the identity is a state
 * write during render, and its guard had no coverage at all.
 */
describe("useSlideFetchReach — the subscription economy", () => {
  /** Count how many times the store is asked to watch a URL. */
  const countingStore = (): {
    store: ImageResourceStore;
    count: () => number;
  } => {
    const inner = createImageResourceStore();
    let subscriptions = 0;
    return {
      count: () => subscriptions,
      store: {
        ...inner,
        getSnapshot: (url: string) => inner.getSnapshot(url),
        subscribe: (url: string, listener: () => void) => {
          subscriptions += 1;
          return inner.subscribe(url, listener);
        },
        reportLoaded: (url: string) => inner.reportLoaded(url),
        reportError: (url: string) => inner.reportError(url),
        requestRetry: (url: string) => inner.requestRetry(url),
        prune: (allowed: readonly string[]) => inner.prune(allowed),
        dispose: () => inner.dispose(),
      },
    };
  };

  it("does not re-subscribe when the band's slides are rebuilt unchanged", () => {
    const { store: counting, count } = countingStore();
    store = counting;

    render([slide("a.webp", true), slide("b.webp", true)]);
    const afterFirst = count();
    expect(afterFirst).toBe(2);

    // Two more dispatches with the very same URLs, fresh arrays and fresh
    // slide objects each time — exactly what a ride produces.
    render([slide("a.webp", true), slide("b.webp", true)]);
    render([slide("a.webp", true), slide("b.webp", true)]);

    expect(count()).toBe(afterFirst);
  });

  it("does re-subscribe when the band's content actually changes", () => {
    const { store: counting, count } = countingStore();
    store = counting;

    render([slide("a.webp", true), slide("b.webp", true)]);
    const afterFirst = count();

    render([slide("a.webp", true), slide("c.webp", true)]);
    expect(count()).toBeGreaterThan(afterFirst);
  });

  it("notices a band that lost a slide, gained one, or only reordered", () => {
    // All three halves of the comparison. The GROWTH case is the one that
    // needs the explicit length check: comparing index by index over the OLD
    // list walks off the end of it and calls a longer band the same band, so
    // the slide that just entered is never waited for and the gate opens
    // without it.
    const { store: counting, count } = countingStore();
    store = counting;

    render([slide("a.webp", true)]);
    const one = count();

    render([slide("a.webp", true), slide("b.webp", true)]);
    const grown = count();
    expect(grown).toBeGreaterThan(one);
    // And it really is waiting for the new one, not just re-subscribing.
    act(() => store.reportLoaded("a.webp"));
    expect(isBufferOpen()).toBe(false);

    render([slide("a.webp", true)]);
    const shorter = count();
    expect(shorter).toBeGreaterThan(grown);

    render([slide("b.webp", true), slide("a.webp", true)]);
    expect(count()).toBeGreaterThan(shorter);
  });

  it("counts a URL once however many lanes show it", () => {
    // A looping deck renders the same slide twice in one band. Subscribing
    // per lane rather than per URL would make the settle check wait for the
    // same answer twice.
    const { store: counting, count } = countingStore();
    store = counting;

    render([
      slide("a.webp", true),
      slide("a.webp", true),
      slide("b.webp", true),
    ]);

    expect(count()).toBe(2);
  });

  it("waits only for the slides that are actually in the band", () => {
    // Buffered lanes are exactly what the reach is deciding about: counting
    // them among the things it waits for would make the gate wait on itself.
    const { store: counting, count } = countingStore();
    store = counting;

    render([slide("a.webp", true), slide("far.webp", false)]);

    expect(count()).toBe(1);
    expect(isBufferOpen()).toBe(false);

    act(() => store.reportLoaded("a.webp"));
    expect(isBufferOpen()).toBe(true);
  });
});
