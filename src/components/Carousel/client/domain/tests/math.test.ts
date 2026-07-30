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
});

describe("normalizePageIndex", () => {
  it("wraps a page index across the cyclic page count", () => {
    expect(normalizePageIndex(5, 4)).toBe(1);
    expect(normalizePageIndex(-1, 4)).toBe(3);
  });
  it("returns 0 when there are no pages", () => {
    expect(normalizePageIndex(3, 0)).toBe(0);
  });
});

