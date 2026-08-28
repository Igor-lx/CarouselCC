/**
 * FORK of `shared/engines/gesture/tests/resolveSwipeDirection.test.ts`, byte-identical apart from this note.
 *
 * `kinetic/internal/` carries its own copies of the gesture and motion
 * engines so the folder can be lifted out whole. The copies are allowed to
 * drift, which is exactly why a guard on the original says nothing about this
 * one: same assertions, different module.
 */

import { describe, expect, it } from "vitest";

import { POINTER_SWIPE_DEFAULTS } from "../swipe/usePointerSwipe";
import { resolveSwipeDirection } from "../swipe/internals/resolveSwipeDirection";

const config = POINTER_SWIPE_DEFAULTS;
const base = { width: 400, config, canCommit: true, flickVelocity: 0 };

describe("resolveSwipeDirection", () => {
  it("never commits when the gesture cannot commit (cancel / never dragged)", () => {
    const r = resolveSwipeDirection({
      ...base,
      rawOffset: -500,
      rawVelocity: -5,
      canCommit: false,
    });
    expect(r.direction).toBe("none");
    expect(r.pointerReleaseVelocity).toBe(-5);
  });

  it("commits a quick flick: fast + at least the token distance", () => {
    const r = resolveSwipeDirection({
      ...base,
      rawOffset: -(config.quickFlickMinOffset + 1),
      rawVelocity: -config.quickFlickVelocity,
    });
    expect(r.direction).toBe("left");
  });

  it("does not flick on speed alone without the minimum offset", () => {
    const r = resolveSwipeDirection({
      ...base,
      rawOffset: -(config.quickFlickMinOffset - 1),
      rawVelocity: -config.quickFlickVelocity * 2,
    });
    expect(r.direction).toBe("none");
  });

  it("commits a slow drag past the resistance-adapted distance threshold", () => {
    const threshold = Math.max(
      config.minSwipeDistance,
      Math.max(
        config.minSwipeDistance,
        base.width * config.swipeThresholdRatio,
      ) *
        (1 - config.resistance),
    );
    const under = resolveSwipeDirection({
      ...base,
      rawOffset: threshold - 1,
      rawVelocity: 0,
    });
    const over = resolveSwipeDirection({
      ...base,
      rawOffset: threshold + 1,
      rawVelocity: 0,
    });
    expect(under.direction).toBe("none");
    expect(over.direction).toBe("right");
  });

  it("never adapts the threshold below minSwipeDistance", () => {
    const stiff = { ...config, resistance: 0.99 };
    const r = resolveSwipeDirection({
      rawOffset: stiff.minSwipeDistance - 1,
      rawVelocity: 0,
      flickVelocity: 0,
      width: 4000,
      config: stiff,
      canCommit: true,
    });
    expect(r.direction).toBe("none");
  });

  it("flicks on the WEIGHTED-AVERAGE speed when the final segment stalled", () => {
    // fast gesture, finger stuck before lift-off: instantaneous ~0, memory high
    const r = resolveSwipeDirection({
      ...base,
      rawOffset: -(config.quickFlickMinOffset + 5),
      rawVelocity: -0.01,
      flickVelocity: -config.quickFlickVelocity * 2,
    });
    expect(r.direction).toBe("left");
    // and the ride speed is the gesture's speed, not the stalled instant
    expect(r.pointerReleaseVelocity).toBeCloseTo(
      -config.quickFlickVelocity * 2,
      10,
    );
  });

  it("memory alone cannot flick without the token distance", () => {
    const r = resolveSwipeDirection({
      ...base,
      rawOffset: -(config.quickFlickMinOffset - 2),
      rawVelocity: 0,
      flickVelocity: -config.quickFlickVelocity * 3,
    });
    expect(r.direction).toBe("none");
  });

  it("maps offset sign to direction (negative = left, positive = right)", () => {
    const left = resolveSwipeDirection({
      ...base,
      rawOffset: -300,
      rawVelocity: 0,
    });
    const right = resolveSwipeDirection({
      ...base,
      rawOffset: 300,
      rawVelocity: 0,
    });
    expect(left.direction).toBe("left");
    expect(right.direction).toBe("right");
  });
});

/**
 * The two commit ways read DIFFERENT quantities for the direction: a flick goes
 * where the finger was going, a distance swipe goes where the content ended up.
 * They only disagree on a late reversal — pull one way, flick back the other
 * without crossing the origin — and taking the offset there yields a direction
 * that contradicts the release velocity handed back with it. A consumer
 * aligning speed to travel (`sameDirectionSpeed`) then zeroes it, and a visibly
 * fast gesture launches its ride from a standstill.
 */
describe("resolveSwipeDirection — a late reversal", () => {
  const reversal = (offsetSign: 1 | -1) =>
    resolveSwipeDirection({
      ...base,
      // Content still displaced one way...
      rawOffset: offsetSign * (config.quickFlickMinOffset + 20),
      // ...while the finger left fast the OTHER way.
      rawVelocity: -offsetSign * config.quickFlickVelocity * 2,
    });

  it("commits along the flick, not along the leftover displacement", () => {
    expect(reversal(1).direction).toBe("left");
    expect(reversal(-1).direction).toBe("right");
  });

  it("the reported direction and release velocity agree in sign", () => {
    for (const sign of [1, -1] as const) {
      const { direction, pointerReleaseVelocity } = reversal(sign);
      expect(direction).toBe(pointerReleaseVelocity < 0 ? "left" : "right");
    }
  });

  it("an unreversed flick is unaffected — both readings already agree", () => {
    const forward = resolveSwipeDirection({
      ...base,
      rawOffset: -(config.quickFlickMinOffset + 20),
      rawVelocity: -config.quickFlickVelocity * 2,
    });
    expect(forward.direction).toBe("left");
  });

  it("a slow reversal stays on the distance rule (offset decides)", () => {
    // Below the flick speed: this is a distance swipe, and displacement IS the
    // criterion there — the deck follows where the content actually sits.
    const slow = resolveSwipeDirection({
      ...base,
      rawOffset: 300,
      rawVelocity: -config.quickFlickVelocity / 10,
    });
    expect(slow.direction).toBe("right");
  });
});
