import { describe, expect, it } from "vitest";

import { POINTER_SWIPE_DEFAULTS } from "../usePointerSwipe";
import { resolveSwipeDirection } from "../internals/resolveSwipeDirection";

const config = POINTER_SWIPE_DEFAULTS;
const base = { width: 400, config, canCommit: true };

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
      ) * (1 - config.resistance),
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
      width: 4000,
      config: stiff,
      canCommit: true,
    });
    expect(r.direction).toBe("none");
  });

  it("maps offset sign to direction (negative = left, positive = right)", () => {
    const left = resolveSwipeDirection({ ...base, rawOffset: -300, rawVelocity: 0 });
    const right = resolveSwipeDirection({ ...base, rawOffset: 300, rawVelocity: 0 });
    expect(left.direction).toBe("left");
    expect(right.direction).toBe("right");
  });
});
