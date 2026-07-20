import { isWaapiSupported } from "../profile/progressCurve";

/**
 * The final act of the stop transport: put keyframes on the compositor,
 * PINNED to the motion clock.
 *
 * The library computes curves, serializes them to stops
 * (`profileProgressStops`) and turns stops into keyframes
 * (`keyframesAlongStops`); this is the delivery step every consumer used to
 * hand-write, and both of its subtleties have bitten in production:
 *
 * - `element.animate` may be missing or THROW on restrictive engines — the
 *   caller must get a clean `null` and run the JS fallback (the controller's
 *   frame loop), not an exception;
 * - a fresh animation is play-pending until the browser commits it, which
 *   phase-shifts the whole run behind the JS curve; pinning `startTime` to
 *   the segment's own `startedAt` (the `motionNow()` domain —
 *   `document.timeline` shares the `performance.now()` origin) makes the
 *   compositor and the controller trace the same curve at the same instants,
 *   so mid-flight handoffs land exactly where the pixels are. Engines that
 *   reject an explicit `startTime` keep the play-pending start — still
 *   correct, merely unpinned.
 *
 * `fill: "both"` is deliberate: the first frame paints the origin before the
 * clock catches up, and the last holds until the caller pins the final style
 * and cancels.
 */
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
    return null;
  }
  try {
    animation.startTime = startedAt;
  } catch {
    // Play-pending fallback keeps the animation, merely unpinned.
  }
  return animation;
};
