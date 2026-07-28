import { describe, expect, it } from "vitest";

import {
  blendDotStates,
  buildDotKeyframes,
  dotKeyframesBetween,
  dotActiveStrength,
  dotStateAt,
  offsetDistance,
  reachedDotIndexes,
  resolveOffsetTarget,
  type DotVisualState,
} from "./fadeKeyframes";

const INACTIVE: DotVisualState = { opacity: 0.2, scale: 1 };
const ACTIVE: DotVisualState = { opacity: 0.8, scale: 1.4 };
const PAGES = 12;
const FINITE = true;
const CYCLIC = false;

describe("dotActiveStrength", () => {
  it("is full under the offset and gone a whole step away", () => {
    expect(dotActiveStrength(0)).toBe(1);
    expect(dotActiveStrength(1)).toBe(0);
    expect(dotActiveStrength(2.5)).toBe(0);
  });

  it("is symmetric and linear between", () => {
    expect(dotActiveStrength(0.25)).toBeCloseTo(0.75, 10);
    expect(dotActiveStrength(-0.25)).toBeCloseTo(0.75, 10);
  });
});

describe("offsetDistance", () => {
  it("is the plain gap on a finite deck", () => {
    expect(offsetDistance(11, 0, PAGES, FINITE)).toBe(11);
  });

  /** The bug this guards: on a cyclic deck the last page is ONE step back
   * from the first, so a wrap must not read as a trip across the strip. */
  it("wraps on a cyclic deck — the ends are neighbours", () => {
    expect(offsetDistance(11, 12, PAGES, CYCLIC)).toBe(1);
    expect(offsetDistance(0, -1, PAGES, CYCLIC)).toBe(1);
    expect(offsetDistance(11, -1, PAGES, CYCLIC)).toBe(0);
    expect(offsetDistance(0, 12, PAGES, CYCLIC)).toBe(0);
  });
});

describe("resolveOffsetTarget", () => {
  it("is the page itself on a finite deck", () => {
    expect(resolveOffsetTarget(0, 5, PAGES, 1, FINITE)).toBe(5);
  });

  it("steps off the front end backwards, not across the strip", () => {
    // Page 0, "prev" in cyclic mode lands on page 11 — one step BACK.
    expect(resolveOffsetTarget(0, 11, PAGES, -1, CYCLIC)).toBe(-1);
  });

  it("steps off the back end forwards, not across the strip", () => {
    // Page 11, "next" lands on page 0 — one step FORWARD.
    expect(resolveOffsetTarget(11, 0, PAGES, 1, CYCLIC)).toBe(12);
  });

  it("keeps an ordinary mid-deck move exactly one step", () => {
    expect(resolveOffsetTarget(4, 5, PAGES, 1, CYCLIC)).toBe(5);
    expect(resolveOffsetTarget(4, 3, PAGES, -1, CYCLIC)).toBe(3);
  });

  it("holds still when the target is already the current page", () => {
    expect(resolveOffsetTarget(4, 4, PAGES, 1, CYCLIC)).toBe(4);
  });
});

describe("dotStateAt", () => {
  it("blends both channels by strength", () => {
    expect(dotStateAt(0, 0, INACTIVE, ACTIVE, PAGES, FINITE)).toEqual(ACTIVE);
    expect(dotStateAt(0, 1, INACTIVE, ACTIVE, PAGES, FINITE)).toEqual(INACTIVE);
    const half = dotStateAt(0, 0.5, INACTIVE, ACTIVE, PAGES, FINITE);
    expect(half.opacity).toBeCloseTo(0.5, 10);
    expect(half.scale).toBeCloseTo(1.2, 10);
  });

  it("lights the far-end dot when the offset steps off the front", () => {
    const last = dotStateAt(11, -1, INACTIVE, ACTIVE, PAGES, CYCLIC);
    expect(last.opacity).toBeCloseTo(0.8, 10);
  });
});

describe("buildDotKeyframes", () => {
  /**
   * The ordinary click must look exactly as it did under the old two-dot
   * cross-fade: a dot one step ahead blends by the plan's progress itself.
   */
  it("reproduces the plain cross-fade across a single step", () => {
    const stops = [0, 0.25, 0.6, 1];
    const incoming = buildDotKeyframes(1, 0, 1, stops, INACTIVE, ACTIVE, PAGES, FINITE);
    const outgoing = buildDotKeyframes(0, 0, 1, stops, INACTIVE, ACTIVE, PAGES, FINITE);

    stops.forEach((p, i) => {
      expect(incoming[i]!.opacity).toBeCloseTo(0.2 + 0.6 * p, 10);
      expect(outgoing[i]!.opacity).toBeCloseTo(0.8 - 0.6 * p, 10);
    });
  });

  /** The repeated click: the middle dot is PASSED THROUGH on this one curve. */
  it("carries a passed-through dot up to active and back down", () => {
    const stops = [0, 0.25, 0.5, 0.75, 1];
    const middle = buildDotKeyframes(1, 0, 2, stops, INACTIVE, ACTIVE, PAGES, FINITE);
    expect(middle[0]!.opacity).toBeCloseTo(0.2, 10);
    expect(middle[2]!.opacity).toBeCloseTo(0.8, 10);
    expect(middle[4]!.opacity).toBeCloseTo(0.2, 10);
  });

  /** The wrap: stepping 0 -> -1 must light ONLY the last dot, and must leave
   * every dot in between untouched — that was the reported bug. */
  it("wrapping backwards lights the last dot and nothing in between", () => {
    const stops = [0, 0.5, 1];
    const last = buildDotKeyframes(11, 0, -1, stops, INACTIVE, ACTIVE, PAGES, CYCLIC);
    expect(last[0]!.opacity).toBeCloseTo(0.2, 10);
    expect(last[2]!.opacity).toBeCloseTo(0.8, 10);

    for (const middle of [3, 5, 8]) {
      const frames = buildDotKeyframes(
        middle,
        0,
        -1,
        stops,
        INACTIVE,
        ACTIVE,
        PAGES,
        CYCLIC,
      );
      frames.forEach((f) => expect(f.opacity).toBeCloseTo(0.2, 10));
    }
  });

  it("keeps a far dot at rest for the whole step", () => {
    const frames = buildDotKeyframes(
      5,
      0,
      1,
      [0, 0.5, 1],
      INACTIVE,
      ACTIVE,
      PAGES,
      FINITE,
    );
    frames.forEach((f) => expect(f.opacity).toBeCloseTo(0.2, 10));
  });
});

describe("reachedDotIndexes", () => {
  it("covers every dot the offset comes within a step of", () => {
    expect(reachedDotIndexes(0, 1, 9, FINITE)).toEqual([0, 1, 2]);
    expect(reachedDotIndexes(0, 2, 9, FINITE)).toEqual([0, 1, 2, 3]);
  });

  it("is direction-agnostic", () => {
    expect(reachedDotIndexes(2, 0, 9, FINITE)).toEqual(
      reachedDotIndexes(0, 2, 9, FINITE),
    );
  });

  it("clamps to the deck when finite", () => {
    expect(reachedDotIndexes(0, 0, 3, FINITE)).toEqual([0, 1]);
    expect(reachedDotIndexes(7, 8, 9, FINITE)).toEqual([6, 7, 8]);
  });

  it("folds past the ends when cyclic — a wrap touches the far dots", () => {
    // 0 -> -1 sweeps positions -2..1, i.e. dots 10, 11, 0, 1.
    expect(reachedDotIndexes(0, -1, PAGES, CYCLIC)).toEqual([0, 1, 10, 11]);
  });

  /** A release after a drag starts the sweep from a FRACTIONAL offset, so the
   * reached set must be taken from where the strip actually is — a set computed
   * off a rounded origin would leave the dot the finger was passing unanimated. */
  it("covers the dots around a fractional origin", () => {
    expect(reachedDotIndexes(0.4, 1, 9, FINITE)).toEqual([0, 1, 2]);
    expect(reachedDotIndexes(0.6, 0, 9, FINITE)).toEqual([0, 1]);
  });

  /** A long cyclic drag leaves the offset UNWRAPPED (e.g. -3.4); the fold must
   * still land on real dot indexes. */
  it("folds an unwrapped fractional origin back onto the strip", () => {
    // -3.4 -> -3 sweeps positions -4.4..-2, i.e. dots 8, 9, 10 (of 12).
    expect(reachedDotIndexes(-3.4, -3, PAGES, CYCLIC)).toEqual([8, 9, 10]);
  });
});

describe("dotKeyframesBetween (the GO_TO direct fade)", () => {
  it("blends straight between two looks along the temporal stops", () => {
    const stops = [0, 0.25, 1];
    const frames = dotKeyframesBetween(INACTIVE, ACTIVE, stops);
    expect(frames[0]!.opacity).toBeCloseTo(0.2, 10);
    expect(frames[1]!.opacity).toBeCloseTo(0.2 + 0.6 * 0.25, 10);
    expect(frames[2]!.opacity).toBeCloseTo(0.8, 10);
    expect(frames[2]!.transform).toBe("scaleX(1.4)");
  });

  /** The point of the direct fade: it is MONOTONIC — a dot never rises on the
   * way down (or vice versa), so nothing "hops" no matter how far the jump. */
  it("never overshoots or reverses between its endpoints", () => {
    const stops = [0, 0.2, 0.4, 0.6, 0.8, 1];
    const frames = dotKeyframesBetween(ACTIVE, INACTIVE, stops);
    for (let i = 1; i < frames.length; i += 1) {
      expect(frames[i]!.opacity).toBeLessThanOrEqual(frames[i - 1]!.opacity + 1e-12);
    }
  });

  it("can start from a mid-flight look (interrupted-motion continuation)", () => {
    const caught = blendDotStates(INACTIVE, ACTIVE, 0.4);
    const frames = dotKeyframesBetween(caught, INACTIVE, [0, 1]);
    expect(frames[0]!.opacity).toBeCloseTo(0.2 + 0.6 * 0.4, 10);
    expect(frames[1]!.opacity).toBeCloseTo(0.2, 10);
  });
});
