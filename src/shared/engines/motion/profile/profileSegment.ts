import { motionNow } from "../runtime/clock";
import type { MotionSampleData, MotionSegmentBase } from "../runtime/types";
import { sampleMotionProfile, type MotionProfile } from "./profile";

// See ../README.md
/** The canonical segment shape for profile-backed motion (built + read here). */
export interface ProfileSegment<Strategy extends string = string>
  extends MotionSegmentBase<Strategy> {
  profile: MotionProfile;
}

/** The sampler for a {@link ProfileSegment}; past duration reports the exact endpoint. */
export const sampleProfileSegment = <Strategy extends string>(
  segment: ProfileSegment<Strategy>,
  timestamp: number,
): MotionSampleData<Strategy> => {
  const elapsed = Math.max(0, timestamp - segment.startedAt);
  const progress = segment.duration > 0 ? Math.min(1, elapsed / segment.duration) : 1;
  const distance = segment.to - segment.from;

  if (progress >= 1) {
    const sampled = sampleMotionProfile(
      segment.profile,
      segment.profile.duration,
      Math.abs(distance),
    );
    return {
      progress,
      value: segment.to,
      velocity: Math.sign(distance) * sampled.speed,
      target: segment.to,
      strategy: segment.strategy,
    };
  }

  const sampled = sampleMotionProfile(segment.profile, elapsed, Math.abs(distance));
  return {
    progress,
    value: segment.from + distance * sampled.distanceProgress,
    velocity: Math.sign(distance) * sampled.speed,
    target: segment.to,
    strategy: segment.strategy,
  };
};

/** Signed velocity → unsigned along `distance` (0 if it opposes); local copy by design. */
export const alignSpeed = (velocity: number, distance: number): number => {
  const direction = Math.sign(distance);
  if (
    direction === 0 ||
    !Number.isFinite(velocity) ||
    Math.sign(velocity) !== direction
  ) {
    return 0;
  }
  return Math.abs(velocity);
};

export interface CreateProfileSegmentInput<Strategy extends string> {
  strategy: Strategy;
  from: number;
  to: number;
  profile: MotionProfile;
  /** Segment clock origin; pass the handoff timestamp when continuing a curve. */
  startedAt?: number;
}

/** Assemble a {@link ProfileSegment}; duration is always the profile's own. */
export const createProfileSegment = <Strategy extends string>({
  strategy,
  from,
  to,
  profile,
  startedAt = motionNow(),
}: CreateProfileSegmentInput<Strategy>): ProfileSegment<Strategy> => ({
  strategy,
  from,
  to,
  duration: profile.duration,
  startedAt,
  profile,
});
