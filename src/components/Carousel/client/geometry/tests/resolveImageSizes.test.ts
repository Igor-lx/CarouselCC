import { describe, expect, it } from "vitest";

import { resolveImageSizes } from "../resolveImageSizes";

/**
 * The `sizes` attribute is what the browser picks an image candidate from, and
 * it picks BEFORE layout — so this string is the only thing standing between a
 * 400px slot and a 4K download. It had no test at all: every one of its
 * mutants survived, including the branch that decides measured from unmeasured.
 *
 * Two answers, and the difference matters in one direction only. Measured: the
 * exact slot in px. Unmeasured: a `vw` fraction that must ROUND UP — asking
 * for less than the slot gets an image the browser then upscales, which is the
 * visible failure; asking for a hair more costs nothing but bytes already in
 * the next candidate up.
 */

describe("resolveImageSizes", () => {
  it("hands back the measured slot, exactly", () => {
    expect(resolveImageSizes({ slotPx: 240, visibleSlidesCount: 3 })).toBe(
      "240px",
    );
  });

  it("treats a measured zero as measured, not as no measurement yet", () => {
    // `slotPx` is `number | null`, and only `null` means "not measured". A
    // zero is a real reading from a collapsed viewport; reading it as absent
    // would ask for a full viewport width of image on a deck that is not there.
    expect(resolveImageSizes({ slotPx: 0, visibleSlidesCount: 3 })).toBe("0px");
  });

  it("falls back to a viewport fraction before the first measurement", () => {
    expect(resolveImageSizes({ slotPx: null, visibleSlidesCount: 1 })).toBe(
      "100vw",
    );
    expect(resolveImageSizes({ slotPx: null, visibleSlidesCount: 4 })).toBe(
      "25vw",
    );
  });

  it("rounds the fraction UP, never down", () => {
    // 100 / 3 is 33.33: asking for 33vw gets an image narrower than the slot,
    // and the browser stretches it. 34vw is the honest ask.
    expect(resolveImageSizes({ slotPx: null, visibleSlidesCount: 3 })).toBe(
      "34vw",
    );
    expect(resolveImageSizes({ slotPx: null, visibleSlidesCount: 7 })).toBe(
      "15vw",
    );
  });

  it("never divides by a count below one", () => {
    // A zero or negative count is not a real layout, but it reaches here on
    // the first render of a misconfigured host. Dividing by it yields
    // `Infinityvw`, which no browser parses — and an unparsable `sizes` falls
    // back to 100vw for EVERY slide at once.
    for (const visibleSlidesCount of [0, -3]) {
      expect(resolveImageSizes({ slotPx: null, visibleSlidesCount })).toBe(
        "100vw",
      );
    }
  });
});
