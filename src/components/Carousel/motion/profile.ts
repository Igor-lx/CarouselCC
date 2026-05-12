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

const MIN_PROFILE_SPEED = 1e-6;

const smoothstep = (progress: number) => progress * progress * (3 - 2 * progress);

const smoothstepIntegral = (progress: number) =>
  progress * progress * progress - 0.5 * progress * progress * progress * progress;

const lerp = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;

const normalizeShare = (value: number) =>
  Number.isFinite(value) ? clamp(value, 0, 1) : 0;

const partitionShares = (acceleration: number, deceleration: number) => {
  let accelerationShare = normalizeShare(acceleration);
  let decelerationShare = normalizeShare(deceleration);
  if (accelerationShare + decelerationShare > 1) {
    accelerationShare = 0.5;
    decelerationShare = 0.5;
  }
  return {
    accelerationShare,
    cruiseShare: Math.max(0, 1 - accelerationShare - decelerationShare),
    decelerationShare,
  };
};

const zoneDuration = (distance: number, startSpeed: number, endSpeed: number) => {
  if (!(distance > 0)) return 0;
  const averageSpeed = Math.max(MIN_PROFILE_SPEED, (Math.max(0, startSpeed) + Math.max(0, endSpeed)) * 0.5);
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
  const safeDistance = Math.abs(distance);
  const safeStart = Math.max(0, startSpeed);
  const safePeak = Math.max(MIN_PROFILE_SPEED, peakSpeed);
  const safeEnd = Math.max(0, endSpeed);
  const { accelerationShare, cruiseShare, decelerationShare } = partitionShares(
    accelerationDistanceShare,
    decelerationDistanceShare,
  );

  const durationBoundPeak =
    typeof targetDuration === "number" && targetDuration > 0
      ? solvePeakForDuration({
          distance: safeDistance,
          targetDuration,
          startSpeed: safeStart,
          peakSpeed: safePeak,
          endSpeed: safeEnd,
          accelerationShare,
          cruiseShare,
          decelerationShare,
        })
      : safePeak;

  const resolvedPeak = Math.max(safePeak, safeStart, safeEnd, durationBoundPeak);

  const zones: MotionProfileZone[] = [];
  let progress = 0;

  progress = pushZone(zones, {
    distanceProgress: progress,
    share: accelerationShare,
    startSpeed: safeStart,
    endSpeed: resolvedPeak,
    distance: safeDistance,
  });
  progress = pushZone(zones, {
    distanceProgress: progress,
    share: cruiseShare,
    startSpeed: resolvedPeak,
    endSpeed: resolvedPeak,
    distance: safeDistance,
  });
  pushZone(zones, {
    distanceProgress: progress,
    share: decelerationShare,
    startSpeed: resolvedPeak,
    endSpeed: safeEnd,
    distance: safeDistance,
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
