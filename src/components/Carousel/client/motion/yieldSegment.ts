import {
  createBrakeProfile,
  createResumeProfile,
  sampleMotionProfile,
  type MotionProfile,
} from "../../../../shared";
import type { ScrollYieldSettings } from "../config";
import { sameDirectionSpeed } from "./speed";
import type { CarouselMotionStrategy, CarouselSegment } from "./types";

/**
 * Segment builders for the scroll yield — the mid-ride graceful slowdown
 * while the page is being scrolled and the browser chrome settles (see
 * useScrollRideYield for the WHY). Both are RE-TIMINGS of a ride that is
 * already in flight: same destination, same strategy, new temporal curve,
 * launched velocity-continuously from an atomic handoff point.
 */

/** Sampling density for the distance→speed inversion below. The profile is
 * time-indexed; scanning its uniform time-samples for the requested distance
 * progress is exact enough at this grid (the speed between neighbours changes
 * by a smoothstep step) and costs one 64-iteration loop, once per resume. */
const SPEED_LOOKUP_SAMPLES = 64;

/**
 * The speed a profile PRESCRIBES at a given distance progress (0..1) — the
 * authority on what a re-timed ride "should" be doing at the point where it
 * now is. The resume returns the ride to this speed rather than to whatever
 * instantaneous speed the brake happened to sample: a brake that engaged in
 * the ride's deceleration tail must not freeze that decaying speed as the
 * ride's new cruise, and one that engaged mid-cruise gets the cruise back.
 */
export const profileSpeedAtDistanceProgress = (
  profile: MotionProfile,
  distance: number,
  distanceProgress: number,
): number => {
  const absDistance = Math.abs(distance);
  if (!(profile.duration > 0) || !(absDistance > 0)) return profile.endSpeed;
  if (distanceProgress <= 0) {
    return sampleMotionProfile(profile, 0, absDistance).speed;
  }
  for (let i = 1; i <= SPEED_LOOKUP_SAMPLES; i += 1) {
    const elapsed = (profile.duration * i) / SPEED_LOOKUP_SAMPLES;
    const sampled = sampleMotionProfile(profile, elapsed, absDistance);
    if (sampled.distanceProgress >= distanceProgress) return sampled.speed;
  }
  return profile.endSpeed;
};

interface YieldSegmentBase {
  /** Handoff position — where the ride visually is right now. */
  position: number;
  /** Handoff velocity (signed, virtual-index units per ms). */
  velocity: number;
  /** The in-flight segment's destination — unchanged by the yield. */
  target: number;
  /** The in-flight segment's strategy — preserved so later handoffs read the
   * same ride kind they would have without the yield. */
  strategy: Exclude<CarouselMotionStrategy, "idle">;
  /** Handoff timestamp (`performance.now()` domain). */
  startedAt: number;
}

export interface BrakeSegmentInput extends YieldSegmentBase {
  settings: Pick<ScrollYieldSettings, "crawlSpeedShare" | "brakeDurationMs">;
}

export interface BrakeSegmentResult {
  segment: CarouselSegment;
  /** The along-track speed the ride had at the brake point — the structural
   * cruise reference the resume returns to (nothing about it depends on the
   * current tuning knobs; it is sampled from the actual ride). */
  entrySpeed: number;
}

/**
 * The brake slice: ramp from the ride's live speed down to a crawl within the
 * brake time budget, then crawl toward the SAME destination. Returns `null`
 * when there is no coherent motion to brake — the handoff velocity does not
 * point at the remaining distance (a turnaround instant, or a ride that has
 * effectively arrived). Sign checks only; no magnitude thresholds.
 */
export const buildBrakeSegment = ({
  position,
  velocity,
  target,
  strategy,
  startedAt,
  settings,
}: BrakeSegmentInput): BrakeSegmentResult | null => {
  const remaining = target - position;
  const entrySpeed = sameDirectionSpeed(velocity, remaining);
  if (!(entrySpeed > 0) || !(Math.abs(remaining) > 0)) return null;

  // The crawl is a SHARE of the speed the eye sees right now — it scales with
  // whatever the ride's tuning produced, instead of hard-coding an absolute
  // speed that today's knobs happen to make look right.
  const crawlSpeed = entrySpeed * settings.crawlSpeedShare;

  const profile = createBrakeProfile({
    distance: remaining,
    startSpeed: entrySpeed,
    crawlSpeed,
    brakeDurationMs: settings.brakeDurationMs,
  });
  if (!(profile.duration > 0)) return null;

  return {
    segment: {
      strategy,
      from: position,
      to: target,
      duration: profile.duration,
      startedAt,
      profile,
    },
    entrySpeed,
  };
};

export interface ResumeSegmentInput extends YieldSegmentBase {
  /** The speed the ride had when the brake engaged — the cruise to return to. */
  cruiseSpeed: number;
  settings: Pick<
    ScrollYieldSettings,
    "resumeRampDurationMs" | "resumeDecelerationDistanceShare"
  >;
}

/**
 * The resume slice: ramp from the crawl back up to the pre-brake cruise
 * within the resume TIME budget — so the snap-back feels the same however
 * much distance remains — then cruise and decelerate into the target. The
 * cruise is the captured pre-brake speed, so the ride returns to exactly the
 * flight the eye last saw, under any tuning.
 */
export const buildResumeSegment = ({
  position,
  velocity,
  target,
  strategy,
  startedAt,
  cruiseSpeed,
  settings,
}: ResumeSegmentInput): CarouselSegment | null => {
  const remaining = target - position;
  if (!(Math.abs(remaining) > 0)) return null;
  const startSpeed = sameDirectionSpeed(velocity, remaining);

  const profile = createResumeProfile({
    distance: remaining,
    startSpeed,
    cruiseSpeed,
    rampDurationMs: settings.resumeRampDurationMs,
    decelerationDistanceShare: settings.resumeDecelerationDistanceShare,
  });
  if (!(profile.duration > 0)) return null;

  return {
    strategy,
    from: position,
    to: target,
    duration: profile.duration,
    startedAt,
    profile,
  };
};
