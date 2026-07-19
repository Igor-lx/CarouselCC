import { sameDirectionSpeed } from "../../../../shared";

/**
 * The COAST math — one pure extrapolation at the runner's takeover. Between
 * lift-off and the post-commit takeover nothing paints the track (the commit
 * task owns the main thread, so a per-frame bridge could not paint through it
 * either — measured on device). Instead the ride LAUNCHES from where the deck
 * would have been had it kept travelling at the release's visual velocity:
 * the commit gap becomes a single catch-up step at the eye's own speed, not a
 * freeze followed by a restart from the stale release point.
 *
 * The extrapolation never overshoots (crossing the ride target clamps AT the
 * target) and never fights the ride: it happens strictly BEFORE the segment
 * is built, as part of choosing the segment's start. A snap-back release
 * (velocity opposing the target) and a calm release (aligned speed 0) launch
 * from the release point itself — there is nothing to coast.
 */
/**
 * Sanity clamp for the coasted ride launch (lift-off -> runner takeover).
 * The takeover extrapolates the launch position over the measured commit gap
 * at the release velocity; this cap bounds the extrapolated interval so a
 * pathologically stalled commit cannot teleport the deck (the target clamp
 * already bounds the distance). An IMPLEMENTATION guard, not a feel knob —
 * colocated with the coast math it protects.
 */
export const GESTURE_COAST_MAX_MS = 250;

export interface CoastedLaunchInput {
  /** The live visual position at takeover (the finger's last write). */
  livePosition: number;
  /** Signed release velocity in virtual units per ms (`uiReleaseVelocity`). */
  releaseVelocity: number;
  /** Clock reading recorded by the END_DRAG dispatch (`motionNow()`). */
  releasedAt: number;
  /** Clock reading at the runner's takeover (`motionNow()`). */
  now: number;
  /** Sanity clamp for the extrapolated interval (`GESTURE_COAST_MAX_MS`):
   * a pathologically stalled commit must not teleport the deck. */
  maxCoastMs: number;
  targetVirtualIndex: number;
}

export const resolveCoastedLaunchPosition = ({
  livePosition,
  releaseVelocity,
  releasedAt,
  now,
  maxCoastMs,
  targetVirtualIndex,
}: CoastedLaunchInput): number => {
  const delta = targetVirtualIndex - livePosition;
  const speed = sameDirectionSpeed(releaseVelocity, delta);
  if (speed === 0) return livePosition;

  const dtMs = Math.min(Math.max(now - releasedAt, 0), maxCoastMs);
  const next = livePosition + Math.sign(delta) * speed * dtMs;
  const crossed = Math.sign(targetVirtualIndex - next) !== Math.sign(delta);
  return crossed ? targetVirtualIndex : next;
};
