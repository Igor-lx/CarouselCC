import type { ResolvedPointerSwipeConfig } from "../types";
import { dominantMagnitude, safeResistance } from "./math";

/**
 * Commit decision at release: did this gesture register as a swipe, and in
 * which direction? Two independent ways to commit:
 *  - quick flick: high gesture speed over at least a token distance. The
 *    speed is the DOMINANT of the last instantaneous velocity and the
 *    weighted-average flick memory, so a fast gesture whose finger
 *    decelerates or sticks before lift-off still reads as a flick;
 *  - distance swipe: the raw offset crossed the (resistance-adapted)
 *    distance threshold — `max(minSwipeDistance, width * swipeThresholdRatio)`
 *    scaled down by `1 - resistance`, because the user FEELS the resisted UI
 *    offset, not the raw finger travel.
 */

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
  // The gesture's speed intent: judged by the whole gesture, not by the
  // last (often decelerating) segment. Also handed out as the release
  // velocity so a committed swipe RIDES at the speed it was flicked with.
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
    return {
      direction: rawOffset < 0 ? ("left" as const) : ("right" as const),
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
