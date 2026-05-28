import { describe, expect, it } from "vitest";

import { canUseCompositorTrackMotion } from "./compositorEligibility";
import type {
  CarouselMotionStrategy,
  CarouselSegment,
  CubicBezier,
} from "./types";

const LINEAR: CubicBezier = { x1: 0, y1: 0, x2: 1, y2: 1 };

const makeSegment = (strategy: CarouselMotionStrategy): CarouselSegment =>
  ({
    strategy,
    from: 0,
    to: 1,
    duration: 100,
    startedAt: 0,
    ...(strategy === "easing" || strategy === "gesture-easing"
      ? { easing: LINEAR }
      : { profile: { duration: 100, endSpeed: 0, zones: [] } }),
  }) as CarouselSegment;

describe("canUseCompositorTrackMotion", () => {
  it.each(["easing", "gesture-easing"] as const)(
    "allows %s segments",
    (strategy) => {
      expect(canUseCompositorTrackMotion(makeSegment(strategy))).toBe(true);
    },
  );

  it.each(["gesture", "repeated", "jump"] as const)(
    "keeps %s segments on the JS path",
    (strategy) => {
      expect(canUseCompositorTrackMotion(makeSegment(strategy))).toBe(false);
    },
  );
});
