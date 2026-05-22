export interface InertialReleaseConfig {
  /** Multiplier applied to the raw release velocity before clamping. */
  inertiaBoost: number;
  /**
   * Fraction of the remaining distance dedicated to smooth deceleration into
   * the target after the inertial fast segment.
   */
  decelerationDistanceShare: number;
}

export interface InertialReleaseResult {
  effectiveReleaseSpeed: number;
  isInertialRelease: boolean;
}

const sameDirectionSpeed = (velocity: number, distance: number) => {
  const direction = Math.sign(distance);
  if (direction === 0 || Math.sign(velocity) !== direction) return 0;
  return Math.abs(velocity);
};

interface ResolveReleaseInput {
  gestureReleaseVelocity: number;
  distanceToTarget: number;
  baseDuration: number;
  config: InertialReleaseConfig;
}

/**
 * Resolve the speed intent of an inertial release. Inputs are trusted —
 * the caller is responsible for finite, in-range values. The function performs
 * algorithmic math only.
 */
export function resolveInertialRelease({
  gestureReleaseVelocity,
  distanceToTarget,
  baseDuration,
  config,
}: ResolveReleaseInput): InertialReleaseResult {
  const minimumSpeed = baseDuration > 0 ? Math.abs(distanceToTarget) / baseDuration : 0;
  const releaseSpeed = sameDirectionSpeed(gestureReleaseVelocity, distanceToTarget);
  const fasterThanBase = releaseSpeed > minimumSpeed;
  const boostedReleaseSpeed = releaseSpeed * config.inertiaBoost;
  const effectiveReleaseSpeed = !fasterThanBase
    ? minimumSpeed
    : minimumSpeed > 0
      ? Math.max(boostedReleaseSpeed, minimumSpeed)
      : boostedReleaseSpeed;
  return {
    effectiveReleaseSpeed,
    isInertialRelease: fasterThanBase,
  };
}
