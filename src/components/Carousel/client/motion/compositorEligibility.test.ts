import { describe, expect, it } from "vitest";

import { canUseCompositorTrackMotion } from "./compositorEligibility";
import type {
  CarouselSegment,
  CubicBezier,
  EasingSegment,
  ProfileSegment,
} from "./types";
import type { MotionProfile } from "./profile";

const EASING: CubicBezier = { x1: 0.32, y1: 0.2, x2: 0.28, y2: 1 };
const PROFILE: MotionProfile = { duration: 100, endSpeed: 0, zones: [] };

const easingSegment = (
  strategy: EasingSegment["strategy"],
): EasingSegment => ({
  strategy,
  from: 0,
  to: 1,
  duration: 100,
  startedAt: 0,
  easing: EASING,
});

const profileSegment = (
  strategy: ProfileSegment["strategy"],
): ProfileSegment => ({
  strategy,
  from: 0,
  to: 1,
  duration: 100,
  startedAt: 0,
  profile: PROFILE,
});

describe("canUseCompositorTrackMotion", () => {
  it("accepts every EasingSegment, including a non-inertial gesture release", () => {
    expect(canUseCompositorTrackMotion(easingSegment("easing"))).toBe(true);
    expect(canUseCompositorTrackMotion(easingSegment("gesture-easing"))).toBe(
      true,
    );
  });

  it("rejects every ProfileSegment", () => {
    for (const strategy of ["gesture", "repeated", "jump"] as const) {
      expect(canUseCompositorTrackMotion(profileSegment(strategy))).toBe(false);
    }
  });

  it("narrows the segment to EasingSegment for the caller", () => {
    const segment: CarouselSegment = easingSegment("easing");
    if (canUseCompositorTrackMotion(segment)) {
      // Type-level: `easing` is reachable only after the guard.
      expect(segment.easing).toBe(EASING);
    } else {
      throw new Error("expected an easing segment to be compositor-eligible");
    }
  });
});
