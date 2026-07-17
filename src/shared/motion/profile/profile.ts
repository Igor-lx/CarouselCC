import { clamp } from "./clamp";

export interface MotionProfileZone {
  startDistanceProgress: number;
  endDistanceProgress: number;
  startTime: number;
  duration: number;
  startSpeed: number;
  endSpeed: number;
}

export interface MotionProfile {
  duration: number;
  endSpeed: number;
  zones: MotionProfileZone[];
}

export interface MotionProfileInput {
  distance: number;
  startSpeed: number;
  peakSpeed: number;
  endSpeed: number;
  accelerationDistanceShare: number;
  decelerationDistanceShare: number;
}

/**
 * Lower bound for the average speed used to compute zone duration. Avoids
 * a 0-divide singularity in `distance / averageSpeed`; not a substitution
 * for an invalid input.
 */
const MIN_PROFILE_SPEED = 1e-6;
const OVERALLOCATED_PROFILE_SHARE = 0.5;
const smoothstep = (progress: number) => progress * progress * (3 - 2 * progress);

const smoothstepIntegral = (progress: number) =>
  progress * progress * progress - 0.5 * progress * progress * progress * progress;

const lerp = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;

export interface MotionProfileShares {
  accelerationShare: number;
  decelerationShare: number;
  cruiseShare: number;
  wasNormalized: boolean;
}

export const normalizeMotionProfileShares = (
  accelerationDistanceShare: number,
  decelerationDistanceShare: number,
): MotionProfileShares => {
  const sum = accelerationDistanceShare + decelerationDistanceShare;

  if (Number.isFinite(sum) && sum > 1) {
    return {
      accelerationShare: OVERALLOCATED_PROFILE_SHARE,
      decelerationShare: OVERALLOCATED_PROFILE_SHARE,
      cruiseShare: 0,
      wasNormalized: true,
    };
  }

  return {
    accelerationShare: accelerationDistanceShare,
    decelerationShare: decelerationDistanceShare,
    cruiseShare: 1 - sum,
    wasNormalized: false,
  };
};

const zoneDuration = (distance: number, startSpeed: number, endSpeed: number) => {
  if (!(distance > 0)) return 0;
  const averageSpeed = Math.max(MIN_PROFILE_SPEED, (startSpeed + endSpeed) * 0.5);
  return distance / averageSpeed;
};

const pushZone = (
  zones: MotionProfileZone[],
  input: {
    distanceProgress: number;
    share: number;
    startSpeed: number;
    endSpeed: number;
    distance: number;
  },
) => {
  if (input.share <= 0) return input.distanceProgress;
  const startTime = zones.length > 0
    ? zones[zones.length - 1]!.startTime + zones[zones.length - 1]!.duration
    : 0;
  const duration = zoneDuration(input.distance * input.share, input.startSpeed, input.endSpeed);
  zones.push({
    startDistanceProgress: input.distanceProgress,
    endDistanceProgress: input.distanceProgress + input.share,
    startTime,
    duration,
    startSpeed: input.startSpeed,
    endSpeed: input.endSpeed,
  });
  return input.distanceProgress + input.share;
};

export const createMotionProfile = ({
  distance,
  startSpeed,
  peakSpeed,
  endSpeed,
  accelerationDistanceShare,
  decelerationDistanceShare,
}: MotionProfileInput): MotionProfile => {
  const absDistance = Math.abs(distance);
  const { accelerationShare, decelerationShare, cruiseShare } =
    normalizeMotionProfileShares(
      accelerationDistanceShare,
      decelerationDistanceShare,
    );

  const resolvedPeak = Math.max(peakSpeed, startSpeed, endSpeed);

  const zones: MotionProfileZone[] = [];
  let progress = 0;

  progress = pushZone(zones, {
    distanceProgress: progress,
    share: accelerationShare,
    startSpeed,
    endSpeed: resolvedPeak,
    distance: absDistance,
  });
  progress = pushZone(zones, {
    distanceProgress: progress,
    share: cruiseShare,
    startSpeed: resolvedPeak,
    endSpeed: resolvedPeak,
    distance: absDistance,
  });
  pushZone(zones, {
    distanceProgress: progress,
    share: decelerationShare,
    startSpeed: resolvedPeak,
    endSpeed,
    distance: absDistance,
  });

  const duration =
    zones.length > 0
      ? zones[zones.length - 1]!.startTime + zones[zones.length - 1]!.duration
      : 0;

  return { duration, endSpeed, zones };
};

export interface BrakeProfileInput {
  /** Signed remaining distance the segment still has to cover. */
  distance: number;
  /** Current speed along the remaining distance (non-negative). */
  startSpeed: number;
  /** Speed to settle into after the ramp (non-negative). */
  crawlSpeed: number;
  /** Time budget of the ramp from `startSpeed` down to `crawlSpeed`. */
  brakeDurationMs: number;
}

/**
 * A yield profile: ramp from the current speed down to a crawl within a TIME
 * budget, then hold the crawl for the whole remaining distance. This shape
 * cannot be expressed through `createMotionProfile` — its cruise always runs
 * at `max(peak, startSpeed)`, so it can never cruise BELOW the entry speed.
 *
 * The ramp is authored in time, not distance, deliberately: the profile
 * exists to make the strip slow BEFORE an external visual disturbance ends
 * (a browser-chrome settle), and that deadline does not scale with how far
 * the ride still has to travel. The ramp distance falls out of the speeds;
 * when it does not fit into the remaining distance, the whole remainder
 * becomes the ramp and the profile simply arrives at crawl speed early.
 *
 * Ends at `crawlSpeed`, not zero: the caller either retargets to a normal
 * profile before arrival (the quiet resume) or lets the segment settle from
 * the crawl — a discontinuity of at most the crawl speed itself.
 */
export const createBrakeProfile = ({
  distance,
  startSpeed,
  crawlSpeed,
  brakeDurationMs,
}: BrakeProfileInput): MotionProfile => {
  const absDistance = Math.abs(distance);
  const entrySpeed = Math.max(0, startSpeed);
  const crawl = Math.max(MIN_PROFILE_SPEED, crawlSpeed);

  const rampDistance = Math.max(0, brakeDurationMs) * (entrySpeed + crawl) * 0.5;
  const rampShare =
    absDistance > 0 ? clamp(rampDistance / absDistance, 0, 1) : 1;

  const zones: MotionProfileZone[] = [];
  let progress = 0;
  progress = pushZone(zones, {
    distanceProgress: progress,
    share: rampShare,
    startSpeed: entrySpeed,
    endSpeed: crawl,
    distance: absDistance,
  });
  pushZone(zones, {
    distanceProgress: progress,
    share: 1 - rampShare,
    startSpeed: crawl,
    endSpeed: crawl,
    distance: absDistance,
  });

  const duration =
    zones.length > 0
      ? zones[zones.length - 1]!.startTime + zones[zones.length - 1]!.duration
      : 0;

  return { duration, endSpeed: crawl, zones };
};

export interface ResumeProfileInput {
  /** Signed remaining distance the segment still has to cover. */
  distance: number;
  /** Current speed along the remaining distance (non-negative) — the crawl. */
  startSpeed: number;
  /** Speed to ramp back up to (non-negative) — the pre-brake cruise. */
  cruiseSpeed: number;
  /** Time budget of the ramp from `startSpeed` up to `cruiseSpeed`. */
  rampDurationMs: number;
  /** Fraction of the distance spent decelerating into the arrival. */
  decelerationDistanceShare: number;
}

/**
 * The brake profile's counterpart: ramp from the crawl back up to the cruise
 * within a TIME budget, cruise, then decelerate into the arrival over a
 * distance share. The ramp is time-authored for the same reason the brake's
 * is — the "snap back to life" must feel identical whether one tenth of a
 * slide remains or three: a distance-share ramp at crawl speeds stretches
 * with the remaining distance and reads as sluggish. When ramp + deceleration
 * do not both fit, the ramp gives way first (a shorter ramp merely arrives at
 * cruise sooner; a squeezed arrival would overshoot the stop).
 */
export const createResumeProfile = ({
  distance,
  startSpeed,
  cruiseSpeed,
  rampDurationMs,
  decelerationDistanceShare,
}: ResumeProfileInput): MotionProfile => {
  const absDistance = Math.abs(distance);
  const entrySpeed = Math.max(0, startSpeed);
  const cruise = Math.max(MIN_PROFILE_SPEED, cruiseSpeed, entrySpeed);

  const decelerationShare = clamp(decelerationDistanceShare, 0, 1);
  const rampDistance = Math.max(0, rampDurationMs) * (entrySpeed + cruise) * 0.5;
  const rampShare =
    absDistance > 0
      ? clamp(rampDistance / absDistance, 0, 1 - decelerationShare)
      : 0;

  const zones: MotionProfileZone[] = [];
  let progress = 0;
  progress = pushZone(zones, {
    distanceProgress: progress,
    share: rampShare,
    startSpeed: entrySpeed,
    endSpeed: cruise,
    distance: absDistance,
  });
  progress = pushZone(zones, {
    distanceProgress: progress,
    share: 1 - rampShare - decelerationShare,
    startSpeed: cruise,
    endSpeed: cruise,
    distance: absDistance,
  });
  pushZone(zones, {
    distanceProgress: progress,
    share: decelerationShare,
    startSpeed: cruise,
    endSpeed: 0,
    distance: absDistance,
  });

  const duration =
    zones.length > 0
      ? zones[zones.length - 1]!.startTime + zones[zones.length - 1]!.duration
      : 0;

  return { duration, endSpeed: 0, zones };
};

const zoneDistanceProgress = (
  zone: MotionProfileZone,
  localProgress: number,
  distance: number,
) => {
  if (!(distance > 0) || !(zone.duration > 0)) return zone.endDistanceProgress;
  const localDistance =
    zone.duration *
    (zone.startSpeed * localProgress +
      (zone.endSpeed - zone.startSpeed) * smoothstepIntegral(localProgress));
  return clamp(
    zone.startDistanceProgress + localDistance / distance,
    zone.startDistanceProgress,
    zone.endDistanceProgress,
  );
};

export const sampleMotionProfile = (
  profile: MotionProfile,
  elapsed: number,
  distance: number,
) => {
  if (profile.zones.length === 0 || !(profile.duration > 0)) {
    return { distanceProgress: 1, speed: profile.endSpeed };
  }
  if (elapsed >= profile.duration) {
    return { distanceProgress: 1, speed: profile.endSpeed };
  }
  const time = clamp(elapsed, 0, profile.duration);
  const zone =
    profile.zones.find((z) => time <= z.startTime + z.duration) ??
    profile.zones[profile.zones.length - 1]!;
  const localProgress = zone.duration > 0
    ? clamp((time - zone.startTime) / zone.duration, 0, 1)
    : 1;

  return {
    distanceProgress: zoneDistanceProgress(zone, localProgress, distance),
    speed: lerp(zone.startSpeed, zone.endSpeed, smoothstep(localProgress)),
  };
};

export interface ProfileSegmentInput {
  from: number;
  to: number;
  startSpeed: number;
  peakSpeed: number;
  endSpeed: number;
  accelerationDistanceShare: number;
  decelerationDistanceShare: number;
}

export const buildProfile = ({
  from,
  to,
  startSpeed,
  peakSpeed,
  endSpeed,
  accelerationDistanceShare,
  decelerationDistanceShare,
}: ProfileSegmentInput) =>
  createMotionProfile({
    distance: to - from,
    startSpeed,
    peakSpeed,
    endSpeed,
    accelerationDistanceShare,
    decelerationDistanceShare,
  });
