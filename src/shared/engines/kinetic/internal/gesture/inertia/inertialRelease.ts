export interface InertialReleaseConfig {
  /** Multiplier applied to the raw release velocity before clamping. */
  inertiaBoost: number;
}

import { sameDirectionSpeed } from "./speed";

export interface InertialReleaseResult {
  effectiveReleaseSpeed: number;
  isInertialRelease: boolean;
}

interface ResolveReleaseInput {
  gestureReleaseVelocity: number;
  distanceToTarget: number;
  baseDuration: number;
  config: InertialReleaseConfig;
}

// Flick judgment: raw pointer faster than base tempo → boosted cruise, else
// base. Inputs trusted (caller guards finite/in-range). See shared/engines/gesture/README.md.
export function resolveInertialRelease({
  gestureReleaseVelocity,
  distanceToTarget,
  baseDuration,
  config,
}: ResolveReleaseInput): InertialReleaseResult {
  const minimumSpeed =
    baseDuration > 0 ? Math.abs(distanceToTarget) / baseDuration : 0;
  const releaseSpeed = sameDirectionSpeed(
    gestureReleaseVelocity,
    distanceToTarget,
  );
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
