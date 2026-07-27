// Put keyframes on the compositor, pinned to the motion clock. See ../README.md
// § WAAPI transport. `fill: "both"` holds the origin before the clock catches up.
import { isWaapiSupported } from "../profile/progressCurve";

export interface PinnedAnimationTiming {
  duration: number;
  /** Segment clock origin (`motionNow()` domain). */
  startedAt: number;
}

export const startPinnedAnimation = (
  element: Element,
  keyframes: Keyframe[],
  { duration, startedAt }: PinnedAnimationTiming,
): Animation | null => {
  if (!isWaapiSupported()) return null;

  let animation: Animation;
  try {
    animation = element.animate(keyframes, { duration, fill: "both" });
  } catch {
    return null; // animate() may throw on restrictive engines → JS fallback
  }
  try {
    animation.startTime = startedAt;
  } catch {
    // engine rejected an explicit startTime → play-pending, still correct
  }
  return animation;
};
