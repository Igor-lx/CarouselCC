import {
  buildProfile,
  createProfileSegment,
  resolveInertialRelease,
  resolvePeakSpeedForDuration,
  resolveReleaseLaunch,
} from "../../../../shared";
import type {
  CarouselInertialReleaseConfig,
  CarouselRuntimeConfig,
  MotionProfileSharesSettings,
  MotionSettings,
  RepeatedClickSettings,
} from "../config";
import type { CarouselState } from "../state";
import { durationByVirtualSpan, resolveStepDuration } from "./duration";
import { sameDirectionSpeed, signedVelocity } from "./speed";
import {
  resolveGoToFlightDuration,
  resolveGoToProfileZones,
  resolveJumpPeakSpeed,
  resolveSpeed,
} from "./timing";
import type {
  CarouselMotionIntent,
  CarouselSegment,
  MotionStart,
} from "./types";

const intentFromState = (state: CarouselState, isInstant: boolean): CarouselMotionIntent => {
  if (isInstant || state.motionPhase === "step-instant") return "instant";
  if (state.teleportVirtualIndex !== null) return "teleport-preflight";
  if (state.isTeleportApproach) return "teleport-approach";
  if (state.motionPhase === "step-snap") return "snap";
  if (state.motionPhase === "step-jump") return "jump";
  if (state.isRepeatedClickAdvance) return "repeated-click";

  switch (state.moveReason) {
    case "autoplay":
      return "autoplay-step";
    case "gesture":
      return "gesture-release";
    case "click":
      return "click-step";
    default:
      return "unknown-step";
  }
};

/** Profile shape for a duration-authored step, by what initiated it. */
const stepProfileShares = (
  state: CarouselState,
  motion: MotionSettings,
): MotionProfileSharesSettings => {
  if (state.motionPhase === "step-snap") return motion.snapBackProfile;
  if (state.moveReason === "autoplay") return motion.autoplayProfile;
  return motion.stepProfile;
};

interface BuildSegmentInput {
  state: CarouselState;
  config: CarouselRuntimeConfig;
  isInstantMode: boolean;
  start: MotionStart;
  startedAt: number;
}

export interface BuildSegmentResult {
  /** The segment to hand to the controller. */
  segment: CarouselSegment;
  /** The segment's duration; the runner publishes it as the autoplay-motion
   * duration for the pagination dot delay. */
  duration: number;
}

/** Duration-authored step: duration and shape shares are known, the peak speed
 * falls out to cover the distance. A hot handoff (`start.velocity`) becomes the
 * start speed so a retarget stays velocity-continuous. */
const buildStepProfile = (
  state: CarouselState,
  start: MotionStart,
  startedAt: number,
  duration: number,
  shares: MotionProfileSharesSettings,
): CarouselSegment => {
  const distance = state.virtualIndex - start.position;
  const startSpeed = sameDirectionSpeed(start.velocity, distance);
  const peakSpeed = resolvePeakSpeedForDuration({
    distance,
    duration,
    startSpeed,
    accelerationDistanceShare: shares.accelerationDistanceShare,
    decelerationDistanceShare: shares.decelerationDistanceShare,
  });
  const profile = buildProfile({
    from: start.position,
    to: state.virtualIndex,
    startSpeed,
    peakSpeed,
    endSpeed: 0,
    accelerationDistanceShare: shares.accelerationDistanceShare,
    decelerationDistanceShare: shares.decelerationDistanceShare,
  });

  return createProfileSegment({
    strategy: "step",
    from: start.position,
    to: state.virtualIndex,
    profile,
    startedAt,
  });
};

/** Fast acceleration profile for a repeated click. Drives straight to the page
 * boundary and decays to rest — no intermediate target, no chained follow-up. */
const buildRepeatedProfile = (
  state: CarouselState,
  start: MotionStart,
  startedAt: number,
  repeated: RepeatedClickSettings,
  normalMoveSpeed: number,
): CarouselSegment => {
  const distance = state.virtualIndex - start.position;
  const peakVelocity = signedVelocity(
    normalMoveSpeed * repeated.speedMultiplier,
    distance,
  );
  const profile = buildProfile({
    from: start.position,
    to: state.virtualIndex,
    startSpeed: sameDirectionSpeed(start.velocity, distance),
    peakSpeed: Math.abs(peakVelocity),
    endSpeed: 0,
    accelerationDistanceShare: repeated.accelerationDistanceShare,
    decelerationDistanceShare: repeated.decelerationDistanceShare,
  });

  return createProfileSegment({
    strategy: "repeated",
    from: start.position,
    to: state.virtualIndex,
    profile,
    startedAt,
  });
};

const buildGestureProfile = (
  state: CarouselState,
  start: MotionStart,
  startedAt: number,
  release: CarouselInertialReleaseConfig,
  releaseSpeed: number,
): CarouselSegment => {
  const distance = state.virtualIndex - start.position;
  // CONTINUITY LAUNCH (see gesture/inertia/releaseLaunch): start at the visual
  // velocity seen at lift-off (handoff velocity is zero during a drag) and
  // accelerate to the intent cruise; a fast lift-off collapses the ramp itself.
  const launch = resolveReleaseLaunch({
    distance,
    visualVelocity: state.gesture.launchVelocity,
    handoffVelocity: start.velocity,
    intentSpeed: releaseSpeed,
  });
  const buildRide = (peakSpeed: number) =>
    buildProfile({
      from: start.position,
      to: state.virtualIndex,
      startSpeed: launch.startSpeed,
      peakSpeed,
      endSpeed: 0,
      accelerationDistanceShare: release.accelerationDistanceShare,
      decelerationDistanceShare: release.decelerationDistanceShare,
    });

  let profile = buildRide(launch.cruiseSpeed);
  // Ride-duration floor: a flick must stay VISIBLE (see minRideDurationMs).
  // Re-solve the cruise down to the floor; the launch speed is never reduced
  // (continuity wins — if it alone beats the floor, the ride just arrives early).
  if (profile.duration < release.minRideDurationMs) {
    const flooredPeak = Math.max(
      resolvePeakSpeedForDuration({
        distance,
        duration: release.minRideDurationMs,
        startSpeed: launch.startSpeed,
        accelerationDistanceShare: release.accelerationDistanceShare,
        decelerationDistanceShare: release.decelerationDistanceShare,
      }),
      launch.startSpeed,
    );
    profile = buildRide(flooredPeak);
  }

  return createProfileSegment({
    strategy: "gesture",
    from: start.position,
    to: state.virtualIndex,
    profile,
    startedAt,
  });
};

type GoToProfilePhase = "single" | "preflight" | "approach";

/**
 * Builds one segment of the GO_TO speed profile. Acceleration/deceleration are
 * local page-screen budgets, not shares of the whole jump, so a long jump
 * starts like a short one.
 * - `single`    - direct jump: accelerate in the first page, decelerate in the last.
 * - `preflight` - pre-teleport slice: local acceleration, then cruise.
 * - `approach`  - post-teleport final page: cruise, then decelerate onto target.
 */
const buildGoToProfile = (
  state: CarouselState,
  start: MotionStart,
  startedAt: number,
  motion: MotionSettings,
  stepSize: number,
  peakSpeed: number,
  phase: GoToProfilePhase,
): CarouselSegment => {
  const distance = state.virtualIndex - start.position;
  const absDistance = Math.abs(distance);
  const startSpeed = sameDirectionSpeed(start.velocity, distance);

  let accelerationDistanceShare: number;
  let decelerationDistanceShare: number;
  let endSpeed: number;

  const zones = resolveGoToProfileZones(stepSize, motion);

  if (phase === "single") {
    accelerationDistanceShare =
      absDistance > 0 ? zones.accelerationDistance / absDistance : 0;
    decelerationDistanceShare =
      absDistance > 0 ? zones.decelerationDistance / absDistance : 0;
    endSpeed = 0;
  } else {
    // Each teleport slice re-expresses an absolute local page-screen budget as
    // a share of that slice's own distance.
    if (phase === "preflight") {
      accelerationDistanceShare =
        absDistance > 0 ? zones.accelerationDistance / absDistance : 0;
      decelerationDistanceShare = 0;
      endSpeed = peakSpeed; // hand the cruise speed to the approach segment
    } else {
      accelerationDistanceShare = 0;
      decelerationDistanceShare =
        absDistance > 0 ? zones.decelerationDistance / absDistance : 0;
      endSpeed = 0;
    }
  }

  let profile = buildProfile({
    from: start.position,
    to: state.virtualIndex,
    startSpeed,
    peakSpeed,
    endSpeed,
    accelerationDistanceShare,
    decelerationDistanceShare,
  });

  // Flight-envelope time ceiling (teleport ON only): a continuous ride must
  // never take LONGER than a flight would, else the longest ride (just below
  // the gate) sits slower than a farther jump. Longer rides are duration-
  // authored to exactly the flight time so ride and flight meet at the gate for
  // any knob ratio; a degenerate envelope (0) means "no ceiling".
  if (phase === "single" && motion.goToTeleportEnabled) {
    const flightDuration = resolveGoToFlightDuration(
      stepSize,
      motion,
      peakSpeed,
      startSpeed,
    );
    if (flightDuration > 0 && profile.duration > flightDuration) {
      const cappedPeak = resolvePeakSpeedForDuration({
        distance,
        duration: flightDuration,
        startSpeed,
        accelerationDistanceShare,
        decelerationDistanceShare,
      });
      if (cappedPeak > peakSpeed) {
        profile = buildProfile({
          from: start.position,
          to: state.virtualIndex,
          startSpeed,
          peakSpeed: cappedPeak,
          endSpeed,
          accelerationDistanceShare,
          decelerationDistanceShare,
        });
      }
    }
  }

  return createProfileSegment({
    strategy: "jump",
    from: start.position,
    to: state.virtualIndex,
    profile,
    startedAt,
  });
};

const goToProfilePhase = (intent: CarouselMotionIntent): GoToProfilePhase => {
  if (intent === "teleport-preflight") return "preflight";
  if (intent === "teleport-approach") return "approach";
  return "single";
};

export function buildCarouselSegment({
  state,
  config,
  isInstantMode,
  start,
  startedAt,
}: BuildSegmentInput): BuildSegmentResult {
  const intent = intentFromState(state, isInstantMode);
  const stepSize = state.layout.visibleSlidesCount;
  const gestureBaseDuration = durationByVirtualSpan({
    from: state.fromVirtualIndex,
    to: state.virtualIndex,
    stepSize,
    baseDuration: config.stepDuration,
  });
  const baseRelease =
    intent === "gesture-release"
      ? resolveInertialRelease({
          gestureReleaseVelocity: state.gesture.pointerVelocity,
          distanceToTarget: state.virtualIndex - state.fromVirtualIndex,
          baseDuration: gestureBaseDuration,
          config: config.releaseConfig,
        })
      : null;

  const moveSpeed = resolveSpeed(stepSize, config.stepDuration);

  if (intent === "repeated-click") {
    const segment = buildRepeatedProfile(
      state,
      start,
      startedAt,
      config.repeatedClick,
      moveSpeed,
    );
    return { segment, duration: segment.duration };
  }

  if (
    intent === "jump" ||
    intent === "teleport-preflight" ||
    intent === "teleport-approach"
  ) {
    const segment = buildGoToProfile(
      state,
      start,
      startedAt,
      config.motion,
      stepSize,
      resolveJumpPeakSpeed(stepSize, config.stepDuration, config.motion.goToSpeedMultiplier),
      goToProfilePhase(intent),
    );
    return { segment, duration: segment.duration };
  }

  if (intent === "gesture-release" && baseRelease?.isInertialRelease) {
    const segment = buildGestureProfile(
      state,
      start,
      startedAt,
      config.releaseConfig,
      baseRelease.effectiveReleaseSpeed,
    );
    return { segment, duration: segment.duration };
  }

  // Duration-authored step (click, autoplay, snap-back, non-inertial release):
  // the step kind picks the shares, the peak speed is derived from the duration.
  const duration = resolveStepDuration({
    motionPhase: state.motionPhase,
    moveReason: state.moveReason,
    isInstant: isInstantMode,
    segmentStartVirtualIndex: state.fromVirtualIndex,
    targetVirtualIndex: state.virtualIndex,
    stepSize,
    snapBackDuration: config.motion.snapBackDuration,
    autoplayDuration: config.autoplayDuration,
    stepDuration: config.stepDuration,
  });

  const segment = buildStepProfile(
    state,
    start,
    startedAt,
    duration,
    stepProfileShares(state, config.motion),
  );
  return { segment, duration: segment.duration };
}
