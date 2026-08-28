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

const slide = (src: string, isActual: boolean): VirtualSlide =>
  ({
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
    render([slide("a.webp", true), slide("b.webp", true), slide("c.webp", false)]);

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
