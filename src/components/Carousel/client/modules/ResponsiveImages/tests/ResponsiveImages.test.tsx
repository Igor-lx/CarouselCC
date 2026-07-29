// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { CarouselMotionContext, CarouselStableContext } from "../../../context";
import type {
  CarouselMotionContextValue,
  CarouselStableContextValue,
} from "../../../context";
import { ResponsiveImages } from "../ResponsiveImages";

/**
 * A headless slot whose body is a predecode manager: it hands buffered bitmaps
 * to `decode()` while the deck rests, so the next page paints without the
 * progressive crawl.
 *
 * Everything about it is invisible. Decode the visible band and the work is
 * wasted; decode during a ride and the main thread stutters exactly when it
 * must not; forget to detach the `load` listeners and every settle leaks one
 * per buffered image.
 */

const trackRef = createRef<HTMLDivElement>();

const stable = {
  layout: {} as CarouselStableContextValue["layout"],
  navigation: {} as CarouselStableContextValue["navigation"],
  visualPosition: null,
  motionPlan: null,
  slides: [],
  trackRef,
  isOffBandFetchOn: true,
  isPaginationInteractiveOn: true,
} as CarouselStableContextValue;

const motionOf = (isIdle: boolean, targetPageIndex = 0) =>
  ({
    status: { motionPhase: isIdle ? "idle" : "step-normal", isIdle, isMoving: !isIdle, isJumping: false, isDragging: false },
    intent: { targetPageIndex },
  }) as CarouselMotionContextValue;

let host: HTMLDivElement;
let root: Root;
let track: HTMLDivElement;
let decoded: string[];
let decodeResolvers: Array<() => void>;

/** A slide element shaped the way SlideItem stamps it. */
const addSlide = (isActual: boolean, currentSrc: string, complete = true) => {
  const slide = document.createElement("div");
  slide.setAttribute("data-active-zone", String(isActual));
  const image = document.createElement("img");
  Object.defineProperty(image, "currentSrc", { value: currentSrc, configurable: true });
  Object.defineProperty(image, "complete", { value: complete, configurable: true });
  slide.append(image);
  track.append(slide);
  return image;
};

const render = (
  motion: CarouselMotionContextValue,
  isPredecodeOn = true,
) =>
  act(() => {
    root.render(
      <CarouselStableContext.Provider value={stable}>
        <CarouselMotionContext.Provider value={motion}>
          <ResponsiveImages isPredecodeOn={isPredecodeOn} />
        </CarouselMotionContext.Provider>
      </CarouselStableContext.Provider>,
    );
  });

/** Let the idle queue and the decode promises run. */
const drain = async () => {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      vi.advanceTimersByTime(200);
      decodeResolvers.splice(0).forEach((resolve) => resolve());
      await Promise.resolve();
    });
  }
};

beforeEach(() => {
  vi.useFakeTimers();
  decoded = [];
  decodeResolvers = [];
  // The decode boundary: record what was asked for, resolve on demand.
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    writable: true,
    value(this: HTMLImageElement) {
      decoded.push(this.src);
      return new Promise<void>((resolve) => decodeResolvers.push(resolve));
    },
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  track = document.createElement("div");
  document.body.appendChild(track);
  (trackRef as { current: HTMLDivElement | null }).current = track;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  track.remove();
  vi.useRealTimers();
});

describe("<ResponsiveImages> — what it decodes", () => {
  it("renders nothing — presence is the whole point", () => {
    render(motionOf(true));
    expect(host.innerHTML).toBe("");
  });

  it("decodes the BUFFERED slides and leaves the visible band alone", async () => {
    addSlide(true, "https://x.test/on-screen.webp");
    addSlide(false, "https://x.test/buffered.webp");
    render(motionOf(true));
    await drain();

    expect(decoded).toContain("https://x.test/buffered.webp");
    expect(decoded).not.toContain("https://x.test/on-screen.webp");
  });

  it("decodes each url once, however often the deck settles", async () => {
    addSlide(false, "https://x.test/buffered.webp");
    render(motionOf(true));
    await drain();
    render(motionOf(true, 1));
    await drain();

    expect(decoded.filter((u) => u.endsWith("buffered.webp"))).toHaveLength(1);
  });

  it("does nothing while the deck is moving", async () => {
    addSlide(false, "https://x.test/buffered.webp");
    render(motionOf(false));
    await drain();
    expect(decoded).toEqual([]);
  });

  it("does nothing when the host has not asked for predecoding", async () => {
    addSlide(false, "https://x.test/buffered.webp");
    render(motionOf(true), false);
    await drain();
    expect(decoded).toEqual([]);
  });

  it("waits for an image that has not started loading yet", async () => {
    // currentSrc is empty until the fetch begins, so the url is picked up on load.
    const image = addSlide(false, "", false);
    render(motionOf(true));
    await drain();
    expect(decoded).toEqual([]);

    Object.defineProperty(image, "currentSrc", {
      value: "https://x.test/late.webp",
      configurable: true,
    });
    await act(async () => {
      image.dispatchEvent(new Event("load"));
    });
    await drain();
    expect(decoded).toContain("https://x.test/late.webp");
  });
});

describe("<ResponsiveImages> — teardown", () => {
  it("stops the queue when the deck starts moving again", async () => {
    addSlide(false, "https://x.test/a.webp");
    addSlide(false, "https://x.test/b.webp");
    render(motionOf(true));

    // One idle slice only, then the deck moves.
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    render(motionOf(false));
    const afterStop = decoded.length;

    await drain();
    expect(decoded.length).toBe(afterStop);
  });

  it("detaches its load listeners on unmount", async () => {
    const image = addSlide(false, "", false);
    render(motionOf(true));
    await drain();

    act(() => root.unmount());
    root = createRoot(host);

    Object.defineProperty(image, "currentSrc", {
      value: "https://x.test/after-unmount.webp",
      configurable: true,
    });
    await act(async () => {
      image.dispatchEvent(new Event("load"));
    });
    await drain();
    expect(decoded).toEqual([]);
  });
});
