import type { ResolvedPointerSwipeConfig } from "../types";
import { safeResistance } from "./math";

/**
 * Commit decision at release: did this gesture register as a swipe, and in
 * which direction? Two independent ways to commit:
 *  - quick flick: high raw pointer velocity over at least a token distance;
 *  - distance swipe: the raw offset crossed the (resistance-adapted)
 *    distance threshold — `max(minSwipeDistance, width * swipeThresholdRatio)`
 *    scaled down by `1 - resistance`, because the user FEELS the resisted UI
 *    offset, not the raw finger travel.
 */

interface ResolveDirectionInput {
  rawOffset: number;
  rawVelocity: number;
  width: number;
  config: ResolvedPointerSwipeConfig;
  canCommit: boolean;
}

export const resolveSwipeDirection = ({
  rawOffset,
  rawVelocity,
  width,
  config,
  canCommit,
}: ResolveDirectionInput) => {
  if (!canCommit) {
    return { direction: "none" as const, pointerReleaseVelocity: rawVelocity };
  }

  const flicked =
    Math.abs(rawVelocity) >= config.quickFlickVelocity &&
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
      pointerReleaseVelocity: rawVelocity,
    };
  }

  if (Math.abs(rawOffset) >= adapted) {
    return {
      direction: rawOffset < 0 ? ("left" as const) : ("right" as const),
      pointerReleaseVelocity: rawVelocity,
    };
  }

  return { direction: "none" as const, pointerReleaseVelocity: rawVelocity };
};
