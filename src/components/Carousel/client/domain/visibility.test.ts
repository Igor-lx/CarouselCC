import { describe, expect, it } from "vitest";

import { slideVisibilityFlags } from "./visibility";

describe("slideVisibilityFlags", () => {
  it("idle at an integer position: the visible band only", () => {
    expect(slideVisibilityFlags(0, 0, 0, 1, false).isActive).toBe(true);
    expect(slideVisibilityFlags(1, 0, 0, 1, false).isActive).toBe(false);
  });

  /**
   * The catch-and-hold regression this guards: a press brakes the strip at a
   * FRACTIONAL position (say 0.3) and the reducer sits in "dragging" with
   * current = previous = 0.3. When the transition flag was false there, the
   * active band collapsed to [0.3, 1.3) — the on-screen LEFT slide (0) fell
   * out and went inert under the user's finger: hit-testing died, and the
   * browser's long-press menu gave its haptic but refused to open. Always the
   * left slide, in both scroll directions, one and two slides visible —
   * measured on device.
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
      expect(slideVisibilityFlags(virtualIndex, 0.4, 0.4, 2, true).isActive).toBe(
        true,
      );
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
