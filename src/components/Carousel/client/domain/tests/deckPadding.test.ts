import { describe, expect, it } from "vitest";

import {
  buildSlideRecords,
  clampedVisibleSlidesCount,
  hasPartialPageLayout,
  padDeckToFullPage,
} from "../slides";
import type { Slide } from "../../public-api/types";

/**
 * `isFullPagesOn` pads a ragged deck with repeats so the last page is whole.
 * The padded entries are the SAME slide shown twice, so they must not be the
 * same React element: a duplicate `key` makes React reuse one mounted node for
 * two lanes, and the deck starts showing the wrong picture in the wrong slot —
 * intermittently, only when the padding is inside the render window.
 */

const deck = (slideCount: number): Slide[] =>
  Array.from({ length: slideCount }, (_, i) => ({
    id: `id-${i}`,
    content: `slide-${i}`,
  }));

const pad = (slideCount: number, visibleSlidesCount: number) =>
  padDeckToFullPage(buildSlideRecords(deck(slideCount)), visibleSlidesCount);

describe("hasPartialPageLayout", () => {
  it("is true only when the last page would be ragged", () => {
    expect(hasPartialPageLayout(10, 3)).toBe(true);
    expect(hasPartialPageLayout(12, 3)).toBe(false);
    expect(hasPartialPageLayout(3, 3)).toBe(false);
  });

  it("an empty deck is not ragged — there is no last page to fill", () => {
    expect(hasPartialPageLayout(0, 3)).toBe(false);
  });

  it("judges against the CLAMPED page size, not the requested one", () => {
    // 2 slides with 5 requested: the page is really 2 wide, so it is whole.
    expect(clampedVisibleSlidesCount(2, 5)).toBe(2);
    expect(hasPartialPageLayout(2, 5)).toBe(false);
  });
});

describe("padDeckToFullPage", () => {
  it("fills the ragged page and stops there", () => {
    const padded = pad(10, 3);
    expect(padded).toHaveLength(12);
    expect(padded.length % 3).toBe(0);
  });

  it("every key in the padded deck is unique", () => {
    // The load-bearing one: a repeat must not collide with its original.
    for (const [count, visible] of [
      [10, 3],
      [7, 4],
      [5, 3],
      [1, 4],
      [13, 5],
    ] as const) {
      const keys = pad(count, visible).map((record) => record.slideKey);
      expect(new Set(keys).size, `deck ${count} / page ${visible}`).toBe(
        keys.length,
      );
    }
  });

  it("a padded entry reuses the slide DATA but not the identity", () => {
    const padded = pad(10, 3);
    const original = padded[0]!;
    const repeat = padded[10]!; // the first filler wraps back to slide 0

    expect(repeat.slideData).toBe(original.slideData); // same content, by reference
    expect(repeat.slideKey).not.toBe(original.slideKey); // different element
    expect(repeat.layoutIndex).toBe(10); // and its own place in the deck
  });

  it("layoutIndex stays a dense 0..n-1 run — the aria label counts on it", () => {
    const padded = pad(10, 3);
    expect(padded.map((record) => record.layoutIndex)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });

  it("never needs more fillers than the deck has slides", () => {
    // `source = records[offset % length]` would silently reuse a filler as the
    // source of another filler if the gap ever reached the deck length. It
    // cannot: the page size is clamped to the deck first, so the gap is at
    // most `page - 1` and the page is at most `length`. Asserted across the
    // whole small-deck space rather than argued in a comment.
    for (let length = 1; length <= 12; length += 1) {
      for (let visible = 1; visible <= 12; visible += 1) {
        const padded = pad(length, visible);
        expect(
          padded.length - length,
          `deck ${length} / page ${visible}`,
        ).toBeLessThan(length);
      }
    }
  });

  it("a page wider than the deck collapses to the deck — nothing to pad", () => {
    // The page size is clamped BEFORE raggedness is judged, so one slide with
    // a requested page of four is a whole page of one, not a page missing three.
    const records = buildSlideRecords(deck(1));
    expect(padDeckToFullPage(records, 4)).toBe(records);
  });

  it("returns the very same array when the deck is already whole", () => {
    // Identity, not just equality: an unnecessary new array would re-run every
    // memo hanging off `records`.
    const records = buildSlideRecords(deck(12));
    expect(padDeckToFullPage(records, 3)).toBe(records);
  });

  it("leaves an empty deck alone instead of dividing by zero", () => {
    const records = buildSlideRecords([]);
    expect(padDeckToFullPage(records, 3)).toBe(records);
  });

  it("does not mutate the records it was given", () => {
    const records = buildSlideRecords(deck(10));
    const before = records.map((r) => r.slideKey);
    padDeckToFullPage(records, 3);
    expect(records).toHaveLength(10);
    expect(records.map((r) => r.slideKey)).toEqual(before);
  });
});
