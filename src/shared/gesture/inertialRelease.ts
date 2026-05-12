export interface InertialReleaseConfig {
  /** Multiplier applied to the raw release velocity before clamping. */
  inertiaBoost: number;
  /**
   * Fraction of the remaining distance dedicated to smooth deceleration into
   * the target after the inertial fast segment.
   */
  decelerationDistanceShare: number;
}

export const DEFAULT_INERTIAL_RELEASE_CONFIG: InertialReleaseConfig = {
  inertiaBoost: 1,
  decelerationDistanceShare: 0.65,
};

export interface InertialReleaseResult {
  effectiveReleaseSpeed: number;
  duration: number;
  isInertialRelease: boolean;
}

const safeSpeed = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.abs(value)) : 0;

const sameDirectionSpeed = (velocity: number, distance: number) => {
  const direction = Math.sign(distance);
  if (direction === 0 || !Number.isFinite(velocity) || Math.sign(velocity) !== direction) {
    return 0;
  }
  return Math.abs(velocity);
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

interface ResolveReleaseInput {
  gestureReleaseVelocity: number;
  distanceToTarget: number;
  baseDuration: number;
  config: InertialReleaseConfig;
}

export function resolveInertialRelease({
  gestureReleaseVelocity,
  distanceToTarget,
  baseDuration,
  config,
}: ResolveReleaseInput): InertialReleaseResult {
  const distance = Number.isFinite(distanceToTarget) && distanceToTarget !== 0
    ? distanceToTarget
    : Math.sign(gestureReleaseVelocity) || 1;
  const safeBaseDuration =
    Number.isFinite(baseDuration) && baseDuration > 0 ? baseDuration : 0;
  const minimumSpeed = safeBaseDuration > 0 ? Math.abs(distance) / safeBaseDuration : 0;
  const releaseSpeed = sameDirectionSpeed(gestureReleaseVelocity, distance);
  const safeReleaseSpeed = safeSpeed(releaseSpeed);
  const safeMinimum = safeSpeed(minimumSpeed);
  const fasterThanBase = safeReleaseSpeed > safeMinimum;
  const boostedReleaseSpeed = safeReleaseSpeed * Math.max(0, config.inertiaBoost);
  const effectiveReleaseSpeed = !fasterThanBase
    ? safeMinimum
    : safeMinimum > 0
      ? Math.max(boostedReleaseSpeed, safeMinimum)
      : boostedReleaseSpeed;
  const decelerationShare = fasterThanBase
    ? clamp(config.decelerationDistanceShare, 0, 1)
    : 0;

  let duration = safeBaseDuration;
  const safeDistance = Math.abs(distance);
  if (safeDistance > 0 && effectiveReleaseSpeed > 0) {
    duration = (safeDistance / effectiveReleaseSpeed) * (1 + decelerationShare);
  }

  return {
    effectiveReleaseSpeed,
    duration: Math.max(0, duration),
    isInertialRelease: fasterThanBase,
  };
}
