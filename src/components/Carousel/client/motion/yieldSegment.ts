import { createBrakeProfile, createResumeProfile } from "../../../../shared";
import type { ScrollYieldSettings } from "../config";
import { sameDirectionSpeed } from "./speed";
import type { CarouselMotionStrategy, CarouselSegment } from "./types";

/**
 * Segment builders for the scroll yield — the mid-ride "vinyl brake" (see
 * useScrollRideYield for the WHY). Both are RE-TIMINGS of a ride already in
 * flight: same destination, same strategy, new temporal curve, launched
 * velocity-continuously from an atomic handoff point. The dive and the exit
 * are ONE self-contained visual, unified across every ride kind — nothing
 * here reads the original profile's shape; a swipe, a button, an autoplay
 * step all yield through the same two ramps.
 *
 * Durations are PROPORTIONAL to the ride's own duration (the tempo it was
 * authored at), never absolute milliseconds — a fast step and a slow autoplay
 * each dive and recover in a beat that matches their own pace.
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
  /** The ORIGINAL ride's authored duration — the tempo the proportional dive
   * and exit ramps scale off. */
  rideDurationMs: number;
}

export interface BrakeSegmentInput extends YieldSegmentBase {
  settings: Pick<ScrollYieldSettings, "crawlSpeedShare" | "entryDurationShare">;
}

export interface BrakeSegmentResult {
  segment: CarouselSegment;
  /** The along-track speed the ride had at the dive point — the speed the exit
   * ramps back up to, so the whole yield is symmetric (drop from v, rise to
   * v). A structural value sampled from the actual ride, not a tuning knob. */
  entrySpeed: number;
}

/**
 * The dive: ease-out ramp from the ride's live speed down to a crawl within
 * a time budget PROPORTIONAL to the ride's own duration, then crawl toward
 * the SAME destination. Returns `null` when there is no coherent motion to
 * brake — the handoff velocity does not point at the remaining distance
 * (a turnaround instant, or a ride that has effectively arrived). Sign checks
 * only; no magnitude thresholds.
 */
export const buildBrakeSegment = ({
  position,
  velocity,
  target,
  strategy,
  startedAt,
  rideDurationMs,
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
    brakeDurationMs: settings.entryDurationShare * rideDurationMs,
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
  /** The speed captured at the dive — the speed the exit ramps back up to. */
  cruiseSpeed: number;
  settings: Pick<
    ScrollYieldSettings,
    "exitDurationShare" | "arrivalDecelerationDistanceShare"
  >;
}

/**
 * The exit: ease-out ramp from the crawl back up to the dive speed within a
 * time budget PROPORTIONAL to the ride's own duration — so the whoosh back to
 * life feels the same however much distance remains and matches the ride's
 * tempo — then cruise and decelerate into the target. The cruise it rises to
 * is the captured dive speed, making the whole yield symmetric; the original
 * profile's shape is never consulted.
 */
export const buildResumeSegment = ({
  position,
  velocity,
  target,
  strategy,
  startedAt,
  rideDurationMs,
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
    rampDurationMs: settings.exitDurationShare * rideDurationMs,
    decelerationDistanceShare: settings.arrivalDecelerationDistanceShare,
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
