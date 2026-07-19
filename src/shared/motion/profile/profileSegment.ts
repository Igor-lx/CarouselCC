import { motionNow } from "../runtime/clock";
import type { MotionSampleData, MotionSegmentBase } from "../runtime/types";
import { sampleMotionProfile, type MotionProfile } from "./profile";

/**
 * The CANONICAL segment shape for profile-backed motion, and its canonical
 * reader. The runtime executes any sampler; but when the curve IS a
 * `MotionProfile` (this library's own product), every consumer used to
 * re-derive the same dozen lines — elapsed → progress → profile sample →
 * value/velocity — and every re-derivation was a fresh chance to get the
 * velocity sign or the `progress >= 1` branch wrong. Build the profile here,
 * read it here.
 */
export interface ProfileSegment<Strategy extends string = string>
  extends MotionSegmentBase<Strategy> {
  profile: MotionProfile;
}

/**
 * Read a profile segment at `timestamp` — the sampler to hand to
 * `controller.start` for any {@link ProfileSegment}. Past the duration it
 * reports the exact endpoint with the profile's terminal speed, which is what
 * lets the runtime settle on `value === target` with no float drift.
 */
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

/**
 * The component of a signed `velocity` that points along `distance` — the
 * bridge from a handoff (signed) to `buildProfile`'s speed inputs (unsigned):
 * an in-flight speed is preserved only when it actually helps the new travel,
 * otherwise the profile launches from rest. A sanctioned local copy of the
 * gesture library's `sameDirectionSpeed` (the engines never import each
 * other — see `motion/profile/clamp.ts` for the precedent), because a
 * motion-only consumer (buttons, autoplay) must not drag the gesture library
 * in for four lines.
 */
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
  /** Segment clock origin (`motionNow()` domain). Defaults to "now" — pass an
   * explicit value when continuing from a handoff, so the new curve starts at
   * the instant the old one was sampled. */
  startedAt?: number;
}

/** Assemble a {@link ProfileSegment}: the duration is always the profile's
 * own — there is no second place for it to disagree with the curve. */
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
