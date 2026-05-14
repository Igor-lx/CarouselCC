import { clamp } from "../domain";

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
  zones: MotionProfileZone[];
}

export interface MotionProfileInput {
  distance: number;
  startSpeed: number;
  peakSpeed: number;
  endSpeed: number;
  accelerationDistanceShare: number;
  decelerationDistanceShare: number;
  targetDuration?: number;
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

const profileDurationForPeak = (input: {
  distance: number;
  startSpeed: number;
  peakSpeed: number;
  endSpeed: number;
  accelerationShare: number;
  cruiseShare: number;
  decelerationShare: number;
}) =>
  zoneDuration(input.distance * input.accelerationShare, input.startSpeed, input.peakSpeed) +
  zoneDuration(input.distance * input.cruiseShare, input.peakSpeed, input.peakSpeed) +
  zoneDuration(input.distance * input.decelerationShare, input.peakSpeed, input.endSpeed);

const solvePeakForDuration = (input: {
  distance: number;
  targetDuration: number;
  startSpeed: number;
  peakSpeed: number;
  endSpeed: number;
  accelerationShare: number;
  cruiseShare: number;
  decelerationShare: number;
}) => {
  if (!(input.distance > 0) || !(input.targetDuration > 0)) return input.peakSpeed;

  let lower = Math.max(MIN_PROFILE_SPEED, input.peakSpeed, input.startSpeed, input.endSpeed);
  let upper = lower;
  let upperDuration = profileDurationForPeak({ ...input, peakSpeed: upper });

  for (let i = 0; upperDuration > input.targetDuration && i < 24; i += 1) {
    upper *= 2;
    upperDuration = profileDurationForPeak({ ...input, peakSpeed: upper });
  }

  if (upperDuration > input.targetDuration) return upper;

  for (let i = 0; i < 24; i += 1) {
    const middle = (lower + upper) / 2;
    const middleDuration = profileDurationForPeak({ ...input, peakSpeed: middle });
    if (middleDuration > input.targetDuration) lower = middle;
    else upper = middle;
  }

  return upper;
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
  targetDuration,
}: MotionProfileInput): MotionProfile => {
  const absDistance = Math.abs(distance);
  const { accelerationShare, decelerationShare, cruiseShare } =
    normalizeMotionProfileShares(
      accelerationDistanceShare,
      decelerationDistanceShare,
    );

  const resolvedPeak =
    typeof targetDuration === "number" && targetDuration > 0
      ? solvePeakForDuration({
          distance: absDistance,
          targetDuration,
          startSpeed,
          peakSpeed,
          endSpeed,
          accelerationShare,
          cruiseShare,
          decelerationShare,
        })
      : peakSpeed;

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

  return { duration, zones };
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
    return { distanceProgress: 1, speed: 0 };
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
  targetDuration?: number;
}

export const buildProfile = ({
  from,
  to,
  startSpeed,
  peakSpeed,
  endSpeed,
  accelerationDistanceShare,
  decelerationDistanceShare,
  targetDuration,
}: ProfileSegmentInput) =>
  createMotionProfile({
    distance: to - from,
    startSpeed,
    peakSpeed,
    endSpeed,
    accelerationDistanceShare,
    decelerationDistanceShare,
    targetDuration,
  });
