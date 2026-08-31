// See docs/architecture/motion.md
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
import { alignSpeed } from "./speed";
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

/**
 * The ONE reading of "what this motion is". Everything downstream — which
 * builder runs, which profile shape it gets, how long it lasts — is a function
 * of this answer and never of the state again.
 *
 * CONSTRAINT: no second ladder over `motionPhase` / `moveReason` / instant mode
 * anywhere below. Three fields can each be read as a different answer, and two
 * ladders over them agree only until one of them is edited.
 */
const intentFromState = (
  state: CarouselState,
  isInstant: boolean,
): CarouselMotionIntent => {
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

const stepProfileShares = (
  intent: CarouselMotionIntent,
  motion: MotionSettings,
): MotionProfileSharesSettings => {
  if (intent === "snap") return motion.snapBackProfile;
  if (intent === "autoplay-step") return motion.autoplayProfile;
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
  segment: CarouselSegment;
  /** Duration; the runner publishes it for the pagination dot delay. */
  duration: number;
}

const buildStepProfile = (
  state: CarouselState,
  start: MotionStart,
  startedAt: number,
  duration: number,
  shares: MotionProfileSharesSettings,
): CarouselSegment => {
  const distance = state.virtualIndex - start.position;
  const startSpeed = alignSpeed(start.velocity, distance);

  // No time to travel in means arriving, not travelling infinitely slowly. A
  // profile solved for a zero duration has no speed to build from and falls
  // back to the builder's floor (1e-6 u/ms) — a step of one page then lasts
  // about sixteen minutes and never visibly starts. Build the arrival instead:
  // a curve with nothing to travel is already at its end, so the very first
  // sample lands on the target.
  if (!(duration > 0)) {
    return createProfileSegment({
      strategy: "step",
      from: start.position,
      to: state.virtualIndex,
      profile: buildProfile({
        from: 0,
        to: 0,
        startSpeed: 0,
        peakSpeed: 0,
        endSpeed: 0,
        accelerationDistanceShare: shares.accelerationDistanceShare,
        decelerationDistanceShare: shares.decelerationDistanceShare,
      }),
      startedAt,
    });
  }

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

const buildRepeatedProfile = (
  state: CarouselState,
  start: MotionStart,
  startedAt: number,
  repeated: RepeatedClickSettings,
  normalMoveSpeed: number,
): CarouselSegment => {
  const distance = state.virtualIndex - start.position;
  const profile = buildProfile({
    from: start.position,
    to: state.virtualIndex,
    startSpeed: alignSpeed(start.velocity, distance),
    peakSpeed: Math.abs(normalMoveSpeed * repeated.speedMultiplier),
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
  // Continuity launch: start at the lift-off visual velocity (see gesture.md).
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
  // Ride-duration floor: re-solve cruise to the floor, but never slow the launch
  // speed (continuity wins). See gesture.md.
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
  const startSpeed = alignSpeed(start.velocity, distance);

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
    // Each teleport slice re-expresses its local page-screen budget as a share.
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

  // Flight-envelope time ceiling: cap a continuous ride at the flight time so no
  // ride is slower than a farther jump (see motion.md; 0 envelope = no ceiling).
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
      resolveJumpPeakSpeed(
        stepSize,
        config.stepDuration,
        config.motion.goToSpeedMultiplier,
      ),
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

  const duration = resolveStepDuration({
    intent,
    segmentStartVirtualIndex: state.fromVirtualIndex,
    targetVirtualIndex: state.virtualIndex,
    stepSize,
    snapBackDurationMs: config.motion.snapBackDurationMs,
    autoplayDuration: config.autoplayDuration,
    stepDuration: config.stepDuration,
  });

  const segment = buildStepProfile(
    state,
    start,
    startedAt,
    duration,
    stepProfileShares(intent, config.motion),
  );
  return { segment, duration: segment.duration };
}
