import { describe, expect, it } from "vitest";

import {
  buildRenderWindow,
  buildSegmentWindow,
  expandWindow,
  windowContains,
} from "../renderWindow";
import { buildCarouselLayout } from "../layout";
import { buildSlideRecords } from "../slides";
import type { CarouselLayout } from "../types";
import type { Slide } from "../../public-api/types";

/**
 * The render window decides which slides EXIST in the DOM. Get it one short and
 * a slide unmounts while it is still on screen — a visible pop mid-ride, and
 * the deck's most expensive kind of bug because it only shows on a real device.
 *
 * The arithmetic is `Math.floor` / `Math.ceil` over a fractional position plus
 * `+ visibleSlidesCount - 1` — off-by-one on every line.
 */

const layoutOf = (
  slideCount: number,
  visibleSlidesCount: number,
  isFinite: boolean,
): CarouselLayout => {
  const slides: Slide[] = Array.from({ length: slideCount }, (_, i) => ({
    id: i,
    content: `s${i}`,
  }));
  return buildCarouselLayout(
    buildSlideRecords(slides),
    visibleSlidesCount,
    isFinite,
  );
};

/** Every integer lane the window would mount. */
const lanes = (w: { start: number; end: number }) =>
  Array.from({ length: w.end - w.start + 1 }, (_, i) => w.start + i);

describe("buildSegmentWindow — the unbuffered truth", () => {
  it("covers every slide on screen at BOTH ends of the travel", () => {
    // Moving 2 -> 5 with 3 visible: at the start slides 2,3,4 are up; at the
    // end 5,6,7. Nothing in that union may be missing.
    const window = buildSegmentWindow(2, 5, layoutOf(12, 3, false));
    const covered = lanes(window);
    for (const lane of [2, 3, 4, 5, 6, 7]) expect(covered).toContain(lane);
  });

  it("is direction-blind — travelling back covers the same union", () => {
    const layout = layoutOf(12, 3, false);
    expect(buildSegmentWindow(5, 2, layout)).toEqual(
      buildSegmentWindow(2, 5, layout),
    );
  });

  it("keeps a FRACTIONAL position's partly-visible slides", () => {
    // Held at 2.4 with 3 visible, the eye sees parts of 2, 3, 4 and 5.
    const covered = lanes(buildSegmentWindow(2.4, 2.4, layoutOf(12, 3, false)));
    for (const lane of [2, 3, 4, 5]) expect(covered).toContain(lane);
  });
});

describe("buildRenderWindow", () => {
  it("contains the segment it was built for, always", () => {
    const layout = layoutOf(12, 3, false);
    for (const [from, to] of [
      [0, 0],
      [0, 3],
      [7, 2],
      [-4, 1],
      [2.4, 5.9],
    ] as const) {
      const buffered = buildRenderWindow(from, to, layout, 4);
      const segment = buildSegmentWindow(from, to, layout);
      expect(
        windowContains(buffered, segment),
        `buffered window lost part of ${from} -> ${to}`,
      ).toBe(true);
    }
  });

  it("buffers by whole page screens on each side", () => {
    const layout = layoutOf(12, 3, false);
    const segment = buildSegmentWindow(3, 3, layout);
    const buffered = buildRenderWindow(3, 3, layout, 4);
    expect(segment.start - buffered.start).toBe(3 * 4);
    expect(buffered.end - segment.end).toBe(3 * 4);
  });

  it("a bigger multiplier only ever widens the window", () => {
    const layout = layoutOf(12, 3, false);
    const small = buildRenderWindow(3, 3, layout, 1);
    const large = buildRenderWindow(3, 3, layout, 4);
    expect(windowContains(large, small)).toBe(true);
  });

  it("a cyclic deck lets the window run past both ends of the data", () => {
    // Negative and beyond-length lanes are how the loop is drawn at all.
    const window = buildRenderWindow(0, 0, layoutOf(12, 3, false), 4);
    expect(window.start).toBeLessThan(0);
    expect(window.end).toBeGreaterThan(11);
  });

  it("a finite deck clamps to real slides — no lane outside the data", () => {
    const window = buildRenderWindow(0, 0, layoutOf(12, 3, true), 4);
    expect(window.start).toBe(0);
    expect(window.end).toBe(11);
  });

  it("a deck that cannot slide renders exactly itself", () => {
    // 2 slides, 3 visible: no travel is possible, so the window is the deck.
    expect(buildRenderWindow(0, 0, layoutOf(2, 3, false), 4)).toEqual({
      start: 0,
      end: 1,
    });
  });

  it("an empty deck produces a degenerate, non-negative window", () => {
    const window = buildRenderWindow(0, 0, layoutOf(0, 3, false), 4);
    expect(window.start).toBe(0);
    expect(window.end).toBe(0);
  });
});

describe("windowContains / expandWindow", () => {
  it("containment is inclusive at both edges", () => {
    const outer = { start: 0, end: 10 };
    expect(windowContains(outer, { start: 0, end: 10 })).toBe(true);
    expect(windowContains(outer, { start: -1, end: 10 })).toBe(false);
    expect(windowContains(outer, { start: 0, end: 11 })).toBe(false);
  });

  it("expanding never shrinks either edge — this is what keeps a slide mounted mid-ride", () => {
    const held = { start: 0, end: 10 };
    const next = { start: 4, end: 6 };
    expect(expandWindow(held, next)).toEqual({ start: 0, end: 10 });
    expect(expandWindow(held, { start: -3, end: 14 })).toEqual({
      start: -3,
      end: 14,
    });
  });
});

describe("buildRenderWindow — the ends of the segment", () => {
  const finite = buildCarouselLayout(
    buildSlideRecords(
      Array.from({ length: 12 }, (_, i) => ({
        id: `s-${i}`,
        content: `c-${i}`,
      })),
    ),
    3,
    true,
  );

  it("spans a backwards ride the same as a forwards one", () => {
    // The segment ends arrive in travel order, so a ride back gives from > to.
    // Take the wrong end for the start and the window opens behind the deck,
    // unmounting the slides it is riding through.
    const back = buildRenderWindow(9, 3, finite, 0);
    expect(back).toEqual(buildRenderWindow(3, 9, finite, 0));
    // Named outright: the lower end of the ride is the start, whichever way
    // the deck travelled. Symmetry alone would still hold if both ends took
    // the larger index and the window opened past the slides in flight.
    expect(back.start).toBe(3);
  });

  it("keeps a window that starts mid-deck where it is", () => {
    // The upper bound of the start clamp is the last slide, not the first: cap
    // it at 0 and every window snaps back to the head of the deck.
    expect(buildRenderWindow(6, 6, finite, 0).start).toBe(6);
  });
});
