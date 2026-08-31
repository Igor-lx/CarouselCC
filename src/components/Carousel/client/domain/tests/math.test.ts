import { describe, expect, it } from "vitest";

import { mod, normalizePageIndex } from "../math";

// `clamp` had a describe of its own. It is `Math.max(min, Math.min(v, max))` —
// it cannot break subtly, and every caller that matters (finite-mode paging,
// the widget step bound) asserts the clamped OUTCOME where it is used.
// `mod` and `normalizePageIndex` stay: the whole cyclic deck rests on them,
// and JavaScript's `%` on negatives is exactly the trap they exist to hide.

describe("mod", () => {
  it("wraps positive and negative values into [0, total)", () => {
    expect(mod(7, 4)).toBe(3);
    expect(mod(-1, 4)).toBe(3);
    expect(mod(-5, 4)).toBe(3);
    expect(mod(4, 4)).toBe(0);
  });

  it("returns 0 for a non-positive total", () => {
    expect(mod(3, 0)).toBe(0);
    expect(mod(3, -2)).toBe(0);
  });

  // The deck size is caller-owned (ADR-002), so a non-number reaches here.
  // `total <= 0` is FALSE for NaN and would let it through into the result.
  it("returns 0 for a total that is not a number at all", () => {
    expect(mod(3, Number.NaN)).toBe(0);
  });
});

describe("normalizePageIndex", () => {
  it("wraps a page index across the cyclic page count", () => {
    expect(normalizePageIndex(5, 4)).toBe(1);
    expect(normalizePageIndex(-1, 4)).toBe(3);
  });
  it("returns 0 when there are no pages", () => {
    expect(normalizePageIndex(3, 0)).toBe(0);
  });
  it("returns 0 for a page count that is not a number", () => {
    expect(normalizePageIndex(3, Number.NaN)).toBe(0);
  });
});

describe("normalizePageIndex", () => {
  it("wraps a page index into a cyclic deck", () => {
    expect(normalizePageIndex(5, 4)).toBe(1);
    expect(normalizePageIndex(-1, 4)).toBe(3);
  });

  it("answers 0 for a deck with no pages", () => {
    // Reached whenever the deck is empty: the callers divide by the page count
    // right after, so anything but 0 here is NaN downstream.
    expect(normalizePageIndex(3, 0)).toBe(0);
    expect(normalizePageIndex(3, -2)).toBe(0);
  });
});
