import { describe, expect, it } from "vitest";
import { createElement } from "react";

import {
  alignedVirtualIndex,
  buildCarouselLayout,
  carouselBoundaryState,
  nearestPageIndex,
  pageContaining,
  pageStart,
  reconciledPageIndex,
} from "../layout";
import { buildSlideRecords } from "../slides";
import type { CarouselLayout } from "../types";
import type { Slide } from "../../public-api/types";

/**
 * The layout maths sits under the reducer, so the reducer tests exercise it —
 * but only along the paths the reducer happens to take, and never at the
 * boundaries where these functions actually differ from one another.
 *
 * The two that get confused for each other are `pageContaining` (floor: which
 * page is this position INSIDE) and `nearestPageIndex` (round: which page
 * would it SNAP to). Swap them and a drag released just past a page edge lands
 * one page short, which reads as "the carousel fights me" and nothing else.
 */

const layoutOf = (
  slideCount: number,
  visibleSlidesCount: number,
  isFinite: boolean,
  idTag = "a",
): CarouselLayout => {
  const slides: Slide[] = Array.from({ length: slideCount }, (_, i) => ({
    id: `${idTag}-${i}`,
    content: `slide-${idTag}-${i}`,
  }));
  return buildCarouselLayout(
    buildSlideRecords(slides),
    visibleSlidesCount,
    isFinite,
  );
};

describe("buildCarouselLayout", () => {
  it("derives page geometry from the deck and the page size", () => {
    const layout = layoutOf(12, 3, false);
    expect(layout.pageCount).toBe(4);
    expect(layout.canSlide).toBe(true);
    expect(layout.visibleSlidesCount).toBe(3);
  });

  it("clamps the page size to the deck — asking for more than exists is not an error", () => {
    const layout = layoutOf(2, 5, false);
    expect(layout.visibleSlidesCount).toBe(2);
    expect(layout.canSlide).toBe(false); // nothing left to scroll to
    expect(layout.pageCount).toBe(1);
  });

  it("rounds a partial last page UP — the remainder still needs a page", () => {
    expect(layoutOf(10, 3, false).pageCount).toBe(4);
  });

  it("gives a cyclic deck a whole number of pages to loop over", () => {
    // 10 slides / 3 per page = 4 pages, so the loop spans 12 lanes, not 10.
    const cyclic = layoutOf(10, 3, false);
    expect(cyclic.virtualLength).toBe(12);
    // A finite deck loops over nothing, so it spans exactly its own slides.
    expect(layoutOf(10, 3, true).virtualLength).toBe(10);
  });

  it("a deck that cannot slide spans itself in either mode", () => {
    expect(layoutOf(2, 3, false).virtualLength).toBe(2);
  });

  it("dataKey changes with slide identity and not with page size", () => {
    expect(layoutOf(6, 3, false).dataKey).toBe(layoutOf(6, 2, false).dataKey);
    expect(layoutOf(6, 3, false).dataKey).not.toBe(
      layoutOf(6, 3, false, "b").dataKey,
    );
  });

  it("survives an empty deck without dividing by zero", () => {
    const empty = layoutOf(0, 3, false);
    expect(empty.pageCount).toBe(0);
    expect(empty.canSlide).toBe(false);
    expect(Number.isFinite(empty.virtualLength)).toBe(true);
  });
});

describe("pageContaining vs nearestPageIndex", () => {
  const layout = layoutOf(12, 3, false); // 4 pages, lanes 0..11

  it("pageContaining FLOORS — a position inside page 1 is page 1, however far along", () => {
    expect(pageContaining(3, layout)).toBe(1);
    expect(pageContaining(5.9, layout)).toBe(1);
  });

  it("nearestPageIndex ROUNDS — the same 5.9 snaps forward to page 2", () => {
    expect(nearestPageIndex(5.9, layout)).toBe(2);
    expect(nearestPageIndex(4.4, layout)).toBe(1);
  });

  it("they disagree on purpose, and that is the whole point", () => {
    // Half a page past the edge: inside page 1, but snapping to page 2.
    expect(pageContaining(4.5, layout)).not.toBe(nearestPageIndex(4.5, layout));
  });

  it("both wrap on a cyclic deck instead of running off the end", () => {
    expect(pageContaining(12, layout)).toBe(0);
    expect(pageContaining(-1, layout)).toBe(3);
    expect(nearestPageIndex(12, layout)).toBe(0);
  });

  it("both clamp on a finite deck instead of wrapping", () => {
    const finite = layoutOf(12, 3, true);
    expect(pageContaining(99, finite)).toBe(3);
    expect(pageContaining(-5, finite)).toBe(0);
    expect(nearestPageIndex(99, finite)).toBe(3);
  });
});

describe("alignedVirtualIndex", () => {
  const layout = layoutOf(12, 3, false); // virtualLength 12

  it("lands on the page start when the reference is already there", () => {
    expect(alignedVirtualIndex(2, 0, layout)).toBe(pageStart(2, 3));
  });

  it("stays on the reference's OWN loop, not lane zero", () => {
    // Reference far up the strip: page 1 must resolve to that loop's page 1.
    expect(alignedVirtualIndex(1, 25, layout)).toBe(27);
    // …and symmetrically below zero.
    expect(alignedVirtualIndex(1, -25, layout)).toBe(-21);
  });

  it("picks the NEAREST lane, so a step never travels a whole loop", () => {
    // From 11, page 0 is one step forward (12), not eleven steps back (0).
    expect(alignedVirtualIndex(0, 11, layout)).toBe(12);
  });

  it("ignores loops entirely on a finite deck", () => {
    expect(alignedVirtualIndex(2, 999, layoutOf(12, 3, true))).toBe(6);
  });
});

describe("carouselBoundaryState", () => {
  it("a cyclic deck has no boundaries — there is always a next page", () => {
    const layout = layoutOf(12, 3, false);
    expect(carouselBoundaryState(0, layout)).toEqual({
      isAtStart: false,
      isAtEnd: false,
    });
    expect(carouselBoundaryState(3, layout)).toEqual({
      isAtStart: false,
      isAtEnd: false,
    });
  });

  it("a finite deck reports both ends, and a single page is both at once", () => {
    const layout = layoutOf(12, 3, true);
    expect(carouselBoundaryState(0, layout).isAtStart).toBe(true);
    expect(carouselBoundaryState(3, layout).isAtEnd).toBe(true);

    const single = layoutOf(3, 3, true);
    const both = carouselBoundaryState(0, single);
    expect(both.isAtStart && both.isAtEnd).toBe(true);
  });
});

describe("reconciledPageIndex", () => {
  it("keeps the reader's PROPORTIONAL place when the page size changes", () => {
    // Halfway through 4 pages should land halfway through 8.
    const from = layoutOf(24, 6, false); // 4 pages
    const to = layoutOf(24, 3, false); // 8 pages
    expect(reconciledPageIndex(2, from, to)).toBe(5);
  });

  it("pins the ends to the ends", () => {
    const from = layoutOf(24, 6, false);
    const to = layoutOf(24, 3, false);
    expect(reconciledPageIndex(0, from, to)).toBe(0);
    expect(reconciledPageIndex(3, from, to)).toBe(7);
  });

  it("never returns a page the new layout does not have", () => {
    const from = layoutOf(24, 3, false); // 8 pages
    const to = layoutOf(24, 12, false); // 2 pages
    for (let page = 0; page < 8; page += 1) {
      const next = reconciledPageIndex(page, from, to);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(to.pageCount);
    }
  });

  it("collapses to page 0 when either side has nothing to page through", () => {
    const single = layoutOf(3, 3, false);
    const many = layoutOf(24, 3, false);
    expect(reconciledPageIndex(5, many, single)).toBe(0);
    expect(reconciledPageIndex(0, single, many)).toBe(0);
  });
});

/**
 * `dataKey` decides the HARD reset: a different key throws the state away and
 * starts over. Every existing test asks whether the key CHANGES; none asks
 * whether it DISCRIMINATES, and those are different questions. A key that
 * collapses two different decks onto one string is the worse failure of the
 * two — the deck changes underneath a state that believes it is still valid,
 * and nothing throws.
 *
 * Mutation testing surfaced this: the separator, the content-type branch and
 * the element marker all survived, because "the key changed" holds no matter
 * what they are replaced with.
 */
describe("buildCarouselLayout — dataKey discriminates, not just changes", () => {
  const keyOf = (slides: Slide[]) =>
    buildCarouselLayout(buildSlideRecords(slides), 3, false).dataKey;

  it("separates slides, so a boundary cannot be shifted unnoticed", () => {
    // Without a separator both decks flatten to the same string.
    expect(
      keyOf([
        { id: "1", content: "ab" },
        { id: "2", content: "c" },
      ]),
    ).not.toBe(
      keyOf([
        { id: "1", content: "a" },
        { id: "2", content: "bc" },
      ]),
    );
  });

  it("tells a string apart from the number that prints the same", () => {
    expect(keyOf([{ id: "1", content: "7" }])).not.toBe(
      keyOf([{ id: "1", content: 7 }]),
    );
  });

  it("tells a React element apart from the text that describes it", () => {
    const element = createElement("span", null, "x");
    expect(keyOf([{ id: "1", content: element }])).not.toBe(
      keyOf([{ id: "1", content: "react-element" }]),
    );
  });

  it("follows identity, not order of equal content", () => {
    expect(
      keyOf([
        { id: "a", content: "x" },
        { id: "b", content: "x" },
      ]),
    ).not.toBe(
      keyOf([
        { id: "b", content: "x" },
        { id: "a", content: "x" },
      ]),
    );
  });
});
