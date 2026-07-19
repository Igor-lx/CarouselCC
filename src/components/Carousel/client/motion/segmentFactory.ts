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
  /**
   * The segment's duration. Published by the runner as the autoplay-motion
   * duration for the pagination dot delay; the controller derives its own
   * timing from the segment.
   */
  duration: number;
}

/**
 * A duration-authored step (click, autoplay, snap-back, non-inertial gesture
 * release): the target duration and the shape shares are known; the peak
 * speed falls out so the profile covers the distance in that duration. A hot
 * handoff (`start.velocity`) is preserved as the profile's start speed, so a
 * retarget stays velocity-continuous.
 */
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

/**
 * Fast acceleration profile for a repeated click - a same-direction click
 * that arrives while the carousel is already moving. The segment drives
 * straight to the page boundary (`state.virtualIndex`) and decays to zero
 * speed; there is no intermediate target and no chained follow-up.
 */
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
  // CONTINUITY LAUNCH (see gesture/inertia/releaseLaunch): start at the
  // visual velocity the eye saw at lift-off (the follow stream's ui
  // velocity; the handoff velocity is zero during a drag), accelerate to
  // the intent cruise. A fast lift-off collapses the ramp by itself.
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
  // Ride-duration floor: a flick must stay a VISIBLE motion (see
  // minRideDurationMs). Re-solve the cruise down to the floor duration; the
  // launch speed is never reduced (continuity wins — if it alone beats the
  // floor, the ride just arrives earlier, same as the solver's contract).
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
 * Builds one segment of the GO_TO speed profile.
 *
 * Acceleration and deceleration are local page-screen budgets, not shares of
 * the whole visible jump. A long jump therefore starts the same way as a short
 * one: accelerate inside the first page screen, cruise, teleport the hidden
 * middle, then cruise/decelerate inside the final page screen.
 *
 * - `single`    - a direct jump: acceleration lives in the first page screen,
 *   deceleration in the last page screen.
 * - `preflight` - the pre-teleport slice: local acceleration, then cruise.
 * - `approach`  - the post-teleport final page: cruise until the configured
 *   deceleration distance starts, then stop on target.
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
  // never take LONGER than a flight would — otherwise the longest ride (just
  // below the teleport gate) sits slower than a farther jump. Rides at or
  // under the envelope keep the shared cruise untouched; longer ones are
  // duration-authored to exactly the flight time (same solver as the steps),
  // so ride and flight durations meet seamlessly at the gate for ANY
  // preflight/approach/gate knob ratio. A degenerate envelope (0 — nothing
  // animated in a flight) means "no ceiling".
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

  // Duration-authored step: click, autoplay, snap-back, and a non-inertial
  // gesture release. The step kind picks the profile shares; the peak speed
  // is derived so the profile covers the distance in the resolved duration.
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
