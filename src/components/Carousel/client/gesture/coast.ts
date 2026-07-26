// The coast math — one pure extrapolation at the runner's takeover, closing the
// commit gap spatially (see docs/architecture/gesture.md).
import { sameDirectionSpeed } from "../../../../shared";

/** Bounds the extrapolated interval so a stalled commit can't teleport the deck. */
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
