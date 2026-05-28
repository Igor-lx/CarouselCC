import {
  resolveInertialRelease,
  type InertialReleaseConfig,
} from "../../../shared";
import type {
  CarouselRuntimeConfig,
  MotionSettings,
  RepeatedClickSettings,
} from "../config";
import type { CarouselState } from "../state";
import { carouselEasingString, parseBezier } from "./bezier";
import { durationByVirtualSpan, resolveEasingDuration } from "./duration";
import { buildProfile } from "./profile";
import { sameDirectionSpeed, signedVelocity } from "./speed";
import {
  resolveGoToProfileZones,
  resolveJumpPeakSpeed,
  resolveSpeed,
} from "./timing";
import type {
  CarouselMotionIntent,
  CarouselSegment,
  EasingSegment,
  MotionStart,
  ProfileSegment,
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

interface BuildSegmentInput {
  state: CarouselState;
  config: CarouselRuntimeConfig;
  isInstantMode: boolean;
  isDragging: boolean;
  start: MotionStart;
  startedAt: number;
}

export interface BuildSegmentResult {
  segment: CarouselSegment;
  duration: number;
}

const buildEasing = (
  state: CarouselState,
  start: MotionStart,
  duration: number,
  startedAt: number,
  isGestureEasing: boolean,
): EasingSegment => ({
  strategy: isGestureEasing ? "gesture-easing" : "easing",
  from: start.position,
  to: state.virtualIndex,
  duration,
  startedAt,
  easing: parseBezier(carouselEasingString(state.motionPhase, state.moveReason)),
});

const buildRepeatedProfile = (
  state: CarouselState,
  start: MotionStart,
  startedAt: number,
  repeated: RepeatedClickSettings,
  normalMoveSpeed: number,
): ProfileSegment => {
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

  return {
    strategy: "repeated",
    from: start.position,
    to: state.virtualIndex,
    duration: profile.duration,
    startedAt,
    profile,
  };
};

const buildGestureProfile = (
  state: CarouselState,
  start: MotionStart,
  startedAt: number,
  release: InertialReleaseConfig,
  releaseSpeed: number,
): ProfileSegment => {
  const distance = state.virtualIndex - start.position;
  const profile = buildProfile({
    from: start.position,
    to: state.virtualIndex,
    startSpeed: sameDirectionSpeed(start.velocity, distance),
    peakSpeed: Math.abs(signedVelocity(releaseSpeed, distance)),
    endSpeed: 0,
    accelerationDistanceShare: 0,
    decelerationDistanceShare: release.decelerationDistanceShare,
  });

  return {
    strategy: "gesture",
    from: start.position,
    to: state.virtualIndex,
    duration: profile.duration,
    startedAt,
    profile,
  };
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
): ProfileSegment => {
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
    if (phase === "preflight") {
      accelerationDistanceShare =
        absDistance > 0 ? zones.accelerationDistance / absDistance : 0;
      decelerationDistanceShare = 0;
      endSpeed = peakSpeed;
    } else {
      accelerationDistanceShare = 0;
      decelerationDistanceShare =
        absDistance > 0 ? zones.decelerationDistance / absDistance : 0;
      endSpeed = 0;
    }
  }

  const profile = buildProfile({
    from: start.position,
    to: state.virtualIndex,
    startSpeed,
    peakSpeed,
    endSpeed,
    accelerationDistanceShare,
    decelerationDistanceShare,
  });

  return {
    strategy: "jump",
    from: start.position,
    to: state.virtualIndex,
    duration: profile.duration,
    startedAt,
    profile,
  };
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
  isDragging,
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
      resolveJumpPeakSpeed(stepSize, config.stepDuration, config.jumpSpeedMultiplier),
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

  const duration = resolveEasingDuration({
    motionPhase: state.motionPhase,
    moveReason: state.moveReason,
    isInstant: isInstantMode,
    isDragging,
    segmentStartVirtualIndex: state.fromVirtualIndex,
    targetVirtualIndex: state.virtualIndex,
    stepSize,
    snapBackDuration: config.motion.snapBackDuration,
    autoplayDuration: config.autoplayDuration,
    stepDuration: config.stepDuration,
  });

  if (intent === "gesture-release") {
    return {
      segment: buildEasing(state, start, duration, startedAt, true),
      duration,
    };
  }

  return {
    segment: buildEasing(state, start, duration, startedAt, false),
    duration,
  };
}
