import type { ResolvedPointerSwipeConfig } from "../types";
import { dominantMagnitude, safeResistance } from "./math";

// Commit decision at release (flick OR distance swipe, resistance-adapted).
// See shared/gesture/README.md В§ Recognition internals (Commit decision).

interface ResolveDirectionInput {
  rawOffset: number;
  rawVelocity: number;
  /** Weighted-average gesture speed (see the hook's flick memory). */
  flickVelocity: number;
  width: number;
  config: ResolvedPointerSwipeConfig;
  canCommit: boolean;
}

export const resolveSwipeDirection = ({
  rawOffset,
  rawVelocity,
  flickVelocity,
  width,
  config,
  canCommit,
}: ResolveDirectionInput) => {
  // Speed intent = dominant of last-instant and flick memory (also the release velocity).
  const gestureVelocity = dominantMagnitude(rawVelocity, flickVelocity);

  if (!canCommit) {
    return { direction: "none" as const, pointerReleaseVelocity: gestureVelocity };
  }

  const flicked =
    Math.abs(gestureVelocity) >= config.quickFlickVelocity &&
    Math.abs(rawOffset) >= config.quickFlickMinOffset;

  const distanceThreshold = Math.max(
    config.minSwipeDistance,
    Math.max(0, width) * config.swipeThresholdRatio,
  );
  const resistanceFactor = 1 - safeResistance(config.resistance);
  const adapted = Math.max(config.minSwipeDistance, distanceThreshold * resistanceFactor);

  if (flicked) {
    // A FLICK commits where the finger was GOING, not where it happened to be.
    // Reading the displacement here let a "pull right, then flick back left
    // without crossing the origin" release commit RIGHT while carrying a
    // negative release velocity вЂ” two contradictory answers from one call, and
    // downstream `sameDirectionSpeed` then zeroed the speed, so the ride
    // launched from a standstill after a fast gesture. The distance branch
    // below still reads displacement: there it IS the criterion.
    return {
      direction: gestureVelocity < 0 ? ("left" as const) : ("right" as const),
      pointerReleaseVelocity: gestureVelocity,
    };
  }

  if (Math.abs(rawOffset) >= adapted) {
    return {
      direction: rawOffset < 0 ? ("left" as const) : ("right" as const),
      pointerReleaseVelocity: gestureVelocity,
    };
  }

  return { direction: "none" as const, pointerReleaseVelocity: gestureVelocity };
};
