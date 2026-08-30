// See ../README.md
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

/** Average-speed floor to avoid a 0-divide in `distance / averageSpeed`. */
const MIN_PROFILE_SPEED = 1e-6;
const smoothstep = (progress: number) =>
  progress * progress * (3 - 2 * progress);

const smoothstepIntegral = (progress: number) =>
  progress * progress * progress -
  0.5 * progress * progress * progress * progress;

const lerp = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;

const zoneDuration = (
  distance: number,
  startSpeed: number,
  endSpeed: number,
) => {
  if (!(distance > 0)) return 0;
  const averageSpeed = Math.max(
    MIN_PROFILE_SPEED,
    (startSpeed + endSpeed) * 0.5,
  );
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
  if (!(input.share > 0)) return input.distanceProgress;
  const startTime =
    zones.length > 0
      ? zones[zones.length - 1]!.startTime + zones[zones.length - 1]!.duration
      : 0;
  const duration = zoneDuration(
    input.distance * input.share,
    input.startSpeed,
    input.endSpeed,
  );
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
  // Shares trusted as-is: over-allocation → negative cruise, its zone skipped (see README).
  const accelerationShare = accelerationDistanceShare;
  const decelerationShare = decelerationDistanceShare;
  const cruiseShare = 1 - accelerationShare - decelerationShare;

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
  const localProgress =
    zone.duration > 0
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
