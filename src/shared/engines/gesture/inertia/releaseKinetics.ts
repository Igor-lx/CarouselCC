// See ../README.md § Release model — flick intent + continuity launch in one call.
import { resolveInertialRelease } from "./inertialRelease";
import { resolveReleaseLaunch } from "./releaseLaunch";

export interface ReleaseKineticsConfig {
  /** Flick amplification over the raw release speed. */
  inertiaBoost: number;
}

/** Etalon feel; override per call via `config`. */
export const RELEASE_KINETICS_DEFAULTS: ReleaseKineticsConfig = {
  inertiaBoost: 1.45,
};

export interface ReleaseKineticsInput {
  /** Signed travel the ride must cover (`to - from`). */
  distance: number;
  /** The release payload's visible lift-off speed (pause-protected). */
  launchVelocity: number;
  /** The release payload's raw pointer speed — the flick judgment reads the
   * FINGER, not the resisted UI. Defaults to `launchVelocity`. */
  pointerReleaseVelocity?: number;
  /**
   * The consumer's base tempo: the cruise a non-flick ride travels at,
   * units per ms. (A duration-authored consumer converts first:
   * `|distance| / duration`.)
   */
  baseSpeed: number;
  /** Velocity of a motion being taken over mid-flight; 0 for plain drags. */
  handoffVelocity?: number;
  config?: Partial<ReleaseKineticsConfig>;
}

export interface ReleaseKinetics {
  /** Launch at this speed — what the eye saw, never above it. */
  startSpeed: number;
  /** Cruise at this speed — the (possibly flick-boosted) intent. */
  cruiseSpeed: number;
  /** The release was faster than the base tempo (a flick). */
  isFlick: boolean;
}

export const resolveReleaseKinetics = ({
  distance,
  launchVelocity,
  pointerReleaseVelocity,
  baseSpeed,
  handoffVelocity = 0,
  config,
}: ReleaseKineticsInput): ReleaseKinetics => {
  const { inertiaBoost } = { ...RELEASE_KINETICS_DEFAULTS, ...config };

  // The intent primitive is duration-authored; express base SPEED as a duration.
  const baseDuration =
    baseSpeed > 0 && Math.abs(distance) > 0 ? Math.abs(distance) / baseSpeed : 0;

  const intent = resolveInertialRelease({
    gestureReleaseVelocity: pointerReleaseVelocity ?? launchVelocity,
    distanceToTarget: distance,
    baseDuration,
    config: { inertiaBoost },
  });

  const launch = resolveReleaseLaunch({
    distance,
    visualVelocity: launchVelocity,
    handoffVelocity,
    intentSpeed: intent.effectiveReleaseSpeed,
  });

  return {
    startSpeed: launch.startSpeed,
    cruiseSpeed: launch.cruiseSpeed,
    isFlick: intent.isInertialRelease,
  };
};

export interface MomentumConfig {
  /** How long the release's velocity is projected forward, ms. */
  momentumMs: number;
  /** Below this speed a release just rests where it was dropped. */
  minSpeed: number;
}

/** Classic kinetic-scroll defaults; override per call. */
export const MOMENTUM_DEFAULTS: MomentumConfig = {
  momentumMs: 260,
  minSpeed: 0.05,
};

/**
 * The DEFAULT landing policy of a free value: project the release velocity
 * forward — the drift a momentum glide travels beyond the drop point, signed
 * like the velocity. `null` means "too slow, rest where dropped" (protects
 * against a lift-off micro-twitch launching a creeping ride). Consumers with
 * real landing policies (snap grids, page targets) skip this and compute
 * their own target.
 */
export const projectMomentum = (
  velocity: number,
  config?: Partial<MomentumConfig>,
): number | null => {
  const { momentumMs, minSpeed } = { ...MOMENTUM_DEFAULTS, ...config };
  if (!Number.isFinite(velocity) || Math.abs(velocity) < minSpeed) return null;
  return velocity * momentumMs;
};
