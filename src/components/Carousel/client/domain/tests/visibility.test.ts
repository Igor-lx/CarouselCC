import { describe, expect, it } from "vitest";

import { laneDistanceFromBand, slideVisibilityFlags } from "../visibility";

describe("slideVisibilityFlags", () => {
  it("idle at an integer position: the visible band only", () => {
    expect(slideVisibilityFlags(0, 0, 0, 1, false).isActive).toBe(true);
    expect(slideVisibilityFlags(1, 0, 0, 1, false).isActive).toBe(false);
  });

  /**
   * The catch-and-hold case: a press brakes the strip at a FRACTIONAL position
   * (say 0.3) and the reducer sits in "dragging" with current = previous = 0.3.
   * With the transition flag false the active band collapses to [0.3, 1.3) —
   * the on-screen LEFT slide (0) falls out and goes inert under the finger, so
   * hit-testing dies and the browser's long-press menu refuses to open.
   *
   * With the flag true, `wasVisible` floors/ceils the fractional band, so
   * every slide actually on screen stays interactive.
   */
  it("a fractional hold keeps BOTH bracketing slides active (1 visible)", () => {
    const left = slideVisibilityFlags(0, 0.3, 0.3, 1, true);
    const right = slideVisibilityFlags(1, 0.3, 0.3, 1, true);
    expect(left.isActive).toBe(true);
    expect(right.isActive).toBe(true);
    // aria-current still names the dominant page — only ONE slide is actual.
    expect(left.isActual).toBe(false);
    expect(right.isActual).toBe(true);
  });

  it("a fractional hold keeps every on-screen slide active (2 visible)", () => {
    for (const virtualIndex of [0, 1, 2]) {
      expect(
        slideVisibilityFlags(virtualIndex, 0.4, 0.4, 2, true).isActive,
      ).toBe(true);
    }
    expect(slideVisibilityFlags(3, 0.4, 0.4, 2, true).isActive).toBe(false);
  });

  it("during a ride, slides visible at the segment start stay active", () => {
    // Ride 0 -> 1 (1 visible): the leaving slide 0 stays interactive.
    expect(slideVisibilityFlags(0, 1, 0, 1, true).isActive).toBe(true);
    expect(slideVisibilityFlags(1, 1, 0, 1, true).isActive).toBe(true);
    expect(slideVisibilityFlags(2, 1, 0, 1, true).isActive).toBe(false);
  });
});

describe("slideVisibilityFlags — any visible-slide count", () => {
  /**
   * The inert-left-slide fix must hold for EVERY layout, not just the 1- and
   * 2-visible decks it was found on. For any N and any fractional hold
   * position, every slide that intersects the viewport must stay active
   * (hit-testable), and the slides just outside must not.
   */
  it("a fractional hold keeps every intersecting slide active, for N = 1..6", () => {
    for (const visible of [1, 2, 3, 4, 5, 6]) {
      for (const base of [0, 3]) {
        const position = base + 0.4; // braked mid-transition
        const first = Math.floor(position);
        const last = Math.ceil(position + visible) - 1;

        for (let v = first; v <= last; v += 1) {
          expect(
            slideVisibilityFlags(v, position, position, visible, true).isActive,
            `visible=${visible} base=${base}: on-screen slide ${v} must stay active`,
          ).toBe(true);
        }
        expect(
          slideVisibilityFlags(first - 1, position, position, visible, true)
            .isActive,
          `visible=${visible} base=${base}: slide ${first - 1} is off-screen left`,
        ).toBe(false);
        expect(
          slideVisibilityFlags(last + 1, position, position, visible, true)
            .isActive,
          `visible=${visible} base=${base}: slide ${last + 1} is off-screen right`,
        ).toBe(false);
      }
    }
  });

  it("during a ride, start- and target-page slides stay active for N = 1..6", () => {
    for (const visible of [1, 2, 3, 4, 5, 6]) {
      const previous = 0;
      const current = visible; // one full page forward
      for (let v = 0; v < 2 * visible; v += 1) {
        expect(
          slideVisibilityFlags(v, current, previous, visible, true).isActive,
          `visible=${visible}: slide ${v} participates in the transition`,
        ).toBe(true);
      }
      expect(
        slideVisibilityFlags(2 * visible, current, previous, visible, true)
          .isActive,
      ).toBe(false);
    }
  });
});

/**
 * The distance drives two very different consumers: the fetch reach (how far
 * outside the band an image may load) and the slide's own priority hints. Both
 * read 0 as "on screen", so an off-by-one here either loads the whole deck
 * eagerly or starves the slide the user is about to see.
 *
 * The band is INCLUSIVE of its last lane, and fractional positions round
 * outward: a slide half a lane out is a whole lane out, because it is either
 * on screen or it is not.
 */
describe("laneDistanceFromBand", () => {
  it("is 0 for every lane inside the band, including both edges", () => {
    expect(laneDistanceFromBand(2, 2, 3)).toBe(0);
    expect(laneDistanceFromBand(3, 2, 3)).toBe(0);
    expect(laneDistanceFromBand(4, 2, 3)).toBe(0);
  });

  it("counts whole lanes on each side of the band", () => {
    expect(laneDistanceFromBand(1, 2, 3)).toBe(1);
    expect(laneDistanceFromBand(0, 2, 3)).toBe(2);
    expect(laneDistanceFromBand(5, 2, 3)).toBe(1);
    expect(laneDistanceFromBand(7, 2, 3)).toBe(3);
  });

  it("rounds a fractional band outward, so a partly visible lane counts as out", () => {
    // Mid-ride the band start is fractional; a slide 0.5 lanes past the edge
    // is off screen, and rounding down would let it claim to be inside.
    expect(laneDistanceFromBand(1, 2.5, 3)).toBe(2);
    expect(laneDistanceFromBand(5, 2.5, 3)).toBe(1);
  });

  it("treats a single-slide band as one lane, not none", () => {
    expect(laneDistanceFromBand(4, 4, 1)).toBe(0);
    expect(laneDistanceFromBand(5, 4, 1)).toBe(1);
    expect(laneDistanceFromBand(3, 4, 1)).toBe(1);
  });
});
