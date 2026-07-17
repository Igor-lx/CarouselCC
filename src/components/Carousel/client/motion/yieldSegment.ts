import { buildProfile, createBrakeProfile } from "../../../../shared";
import type { MotionProfileSharesSettings, ScrollYieldSettings } from "../config";
import { sameDirectionSpeed } from "./speed";
import type { CarouselMotionStrategy, CarouselSegment } from "./types";

/**
 * Segment builders for the scroll yield — the mid-ride graceful slowdown
 * while the page is being scrolled and the browser chrome settles (see
 * useScrollRideYield for the WHY). Both are RE-TIMINGS of a ride that is
 * already in flight: same destination, same strategy, new temporal curve,
 * launched velocity-continuously from an atomic handoff point.
 */

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
  shares: MotionProfileSharesSettings;
}

/**
 * The resume slice: accelerate from the crawl back to the pre-brake cruise
 * and finish the ride, decelerating into the target as any step does. The
 * peak is the captured pre-brake speed, so the ride returns to exactly the
 * flight the eye last saw — under any tuning.
 */
export const buildResumeSegment = ({
  position,
  velocity,
  target,
  strategy,
  startedAt,
  cruiseSpeed,
  shares,
}: ResumeSegmentInput): CarouselSegment | null => {
  const remaining = target - position;
  if (!(Math.abs(remaining) > 0)) return null;
  const startSpeed = sameDirectionSpeed(velocity, remaining);

  const profile = buildProfile({
    from: position,
    to: target,
    startSpeed,
    peakSpeed: cruiseSpeed,
    endSpeed: 0,
    accelerationDistanceShare: shares.accelerationDistanceShare,
    decelerationDistanceShare: shares.decelerationDistanceShare,
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
