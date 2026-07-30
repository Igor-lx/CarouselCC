// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { VirtualSlide } from "../../domain";
import { createImageResourceStore } from "../imageResource";
import type { ImageResourceStore } from "../imageResource";
import { useActiveBandGate } from "../useActiveBandGate";

/**
 * The gate decides whether the render window's BUFFER is allowed to compete
 * for bandwidth with the slide the user is looking at. Two properties carry
 * the whole design and both are easy to regress:
 *
 *  - it opens on any first outcome, error included — a broken visible image
 *    must not hold the buffer hostage;
 *  - the outcome LATCHES — a retry cycles the status back to `loading`, and a
 *    gate that reopened on `loaded` alone would slam shut mid-cycle and
 *    abandon the buffer's in-flight fetches.
 */

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
  }) as unknown as VirtualSlide;

let observed = false;

function Probe({ virtualSlides }: { virtualSlides: VirtualSlide[] }) {
  observed = useActiveBandGate({
    virtualSlides,
    isContentImg: true,
    isResponsiveImagesOn: true,
    imageResourceStore: store,
  });
  return null;
}

const render = (virtualSlides: VirtualSlide[]): void => {
  act(() => {
    root.render(<Probe virtualSlides={virtualSlides} />);
  });
};

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  store = createImageResourceStore();
  observed = false;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  store.dispose();
});

describe("useActiveBandGate", () => {
  it("holds the buffer back until the band reports", () => {
    render([slide("a.webp", true), slide("b.webp", false)]);
    expect(observed).toBe(false);

    act(() => store.reportLoaded("a.webp"));
    expect(observed).toBe(true);
  });

  it("waits for EVERY slide of a multi-slide band", () => {
    render([
      slide("a.webp", true),
      slide("b.webp", true),
      slide("c.webp", false),
    ]);

    act(() => store.reportLoaded("a.webp"));
    expect(observed).toBe(false);

    act(() => store.reportLoaded("b.webp"));
    expect(observed).toBe(true);
  });

  it("opens on error too — a broken image is not a hostage taker", () => {
    render([slide("a.webp", true), slide("b.webp", false)]);

    act(() => store.reportError("a.webp"));
    expect(observed).toBe(true);
  });

  it("stays open while a retry cycles the status back to loading", () => {
    render([slide("a.webp", true)]);
    act(() => store.reportError("a.webp"));
    expect(observed).toBe(true);

    // A retry re-arms the resource: status returns to `loading` with a new
    // generation. The latch must ignore it.
    act(() => store.requestRetry("a.webp"));
    render([slide("a.webp", true)]);
    expect(observed).toBe(true);
  });

  it("does not re-subscribe when the band's URLs are unchanged", () => {
    // `virtualSlides` is a fresh array on every dispatch — twice per ride —
    // but the band's URLs change at most once. A gate keyed on array identity
    // tore down and rebuilt N store subscriptions in the click frame.
    let subscriptions = 0;
    const real = store;
    const counting: ImageResourceStore = {
      ...real,
      subscribe: (url, listener) => {
        subscriptions += 1;
        return real.subscribe(url, listener);
      },
    };
    store = counting;

    render([slide("a.webp", true), slide("b.webp", false)]);
    const afterFirst = subscriptions;
    // A new array, same content — exactly what a dispatch produces.
    render([slide("a.webp", true), slide("b.webp", false)]);
    expect(subscriptions).toBe(afterFirst);

    store = real;
  });

  it("is open when the band carries no images at all", () => {
    render([]);
    expect(observed).toBe(true);
  });
});
