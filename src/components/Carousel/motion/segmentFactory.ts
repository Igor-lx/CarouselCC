import {
  resolveInertialRelease,
  type InertialReleaseConfig,
} from "../../../shared";
import {
  REPEATED_CLICK_MAX_DECELERATION_DISTANCE_SHARE,
} from "../config";
import type {
  CarouselRuntimeConfig,
  RepeatedClickSettings,
} from "../config";
import type { CarouselState } from "../state";
import { carouselEasingString, parseBezier } from "./bezier";
import { resolveCarouselDuration } from "./duration";
import { buildProfile } from "./profile";
import { averageSpeed, sameDirectionSpeed, signedVelocity } from "./speed";
import type {
  CarouselMotionIntent,
  CarouselSegment,
  EasingSegment,
  MotionStart,
  ProfileSegment,
} from "./types";

const clampDecelerationShare = (share: number) =>
  Math.min(share, REPEATED_CLICK_MAX_DECELERATION_DISTANCE_SHARE);

const normalSpeed = (stepSize: number, stepDuration: number) =>
  stepSize > 0 && stepDuration > 0 ? averageSpeed(stepSize, stepDuration) : 0;

const intentFromState = (state: CarouselState, isInstant: boolean): CarouselMotionIntent => {
  if (isInstant || state.motionPhase === "step-instant") return "instant";
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
  isRepeatedFollowUp: boolean;
  start: MotionStart;
  startedAt: number;
}

export interface BuildSegmentResult {
  segment: CarouselSegment;
  intent: CarouselMotionIntent;
  duration: number;
  isInertialRelease: boolean;
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
  duration: number,
  startedAt: number,
  repeated: RepeatedClickSettings,
  hasFollowUp: boolean,
  normalMoveSpeed: number,
): ProfileSegment => {
  const distance = state.virtualIndex - start.position;
  const peakVelocity = signedVelocity(
    normalMoveSpeed * Math.max(1, repeated.speedMultiplier),
    distance,
  );
  const endVelocity = hasFollowUp
    ? signedVelocity(normalMoveSpeed, distance)
    : 0;

  return {
    strategy: "repeated",
    from: start.position,
    to: state.virtualIndex,
    duration,
    startedAt,
    profile: buildProfile({
      from: start.position,
      to: state.virtualIndex,
      startSpeed: sameDirectionSpeed(start.velocity, distance),
      peakSpeed: Math.abs(peakVelocity),
      endSpeed: Math.abs(endVelocity),
      accelerationDistanceShare: repeated.accelerationDistanceShare,
      decelerationDistanceShare: clampDecelerationShare(repeated.decelerationDistanceShare),
      targetDuration: duration,
    }),
  };
};

const buildRepeatedFollowUpProfile = (
  state: CarouselState,
  start: MotionStart,
  duration: number,
  startedAt: number,
  repeated: RepeatedClickSettings,
  normalMoveSpeed: number,
): ProfileSegment => {
  const distance = state.virtualIndex - start.position;
  const peakVelocity = signedVelocity(normalMoveSpeed, distance);
  return {
    strategy: "repeated-follow-up",
    from: start.position,
    to: state.virtualIndex,
    duration,
    startedAt,
    profile: buildProfile({
      from: start.position,
      to: state.virtualIndex,
      startSpeed: sameDirectionSpeed(start.velocity, distance),
      peakSpeed: Math.abs(peakVelocity),
      endSpeed: 0,
      accelerationDistanceShare: 0,
      decelerationDistanceShare: clampDecelerationShare(repeated.decelerationDistanceShare),
    }),
  };
};

const buildGestureProfile = (
  state: CarouselState,
  start: MotionStart,
  duration: number,
  startedAt: number,
  release: InertialReleaseConfig,
  releaseSpeed: number,
): ProfileSegment => {
  const distance = state.virtualIndex - start.position;
  return {
    strategy: "gesture",
    from: start.position,
    to: state.virtualIndex,
    duration,
    startedAt,
    profile: buildProfile({
      from: start.position,
      to: state.virtualIndex,
      startSpeed: sameDirectionSpeed(start.velocity, distance),
      peakSpeed: Math.abs(signedVelocity(releaseSpeed, distance)),
      endSpeed: 0,
      accelerationDistanceShare: 0,
      decelerationDistanceShare: release.decelerationDistanceShare,
      targetDuration: duration,
    }),
  };
};

const buildHandoffProfile = (
  state: CarouselState,
  start: MotionStart,
  duration: number,
  startedAt: number,
  normalMoveSpeed: number,
): ProfileSegment => {
  const distance = state.virtualIndex - start.position;
  const peakVelocity = signedVelocity(normalMoveSpeed, distance);
  return {
    strategy: "handoff",
    from: start.position,
    to: state.virtualIndex,
    duration,
    startedAt,
    profile: buildProfile({
      from: start.position,
      to: state.virtualIndex,
      startSpeed: sameDirectionSpeed(start.velocity, distance),
      peakSpeed: Math.abs(peakVelocity),
      endSpeed: 0,
      accelerationDistanceShare: 0,
      decelerationDistanceShare: 1,
      targetDuration: duration,
    }),
  };
};

export function buildCarouselSegment({
  state,
  config,
  isInstantMode,
  isDragging,
  isRepeatedFollowUp,
  start,
  startedAt,
}: BuildSegmentInput): BuildSegmentResult {
  const intent = intentFromState(state, isInstantMode);
  const stepSize = state.layout.visibleSlidesCount;
  const baseRelease = resolveInertialRelease({
    gestureReleaseVelocity: state.gesture.pointerVelocity,
    distanceToTarget: state.virtualIndex - state.fromVirtualIndex,
    baseDuration: stepSize > 0 ? config.stepDuration * Math.abs(state.virtualIndex - state.fromVirtualIndex) / stepSize : config.stepDuration,
    config: config.releaseConfig,
  });

  const duration = resolveCarouselDuration({
    motionPhase: state.motionPhase,
    moveReason: state.moveReason,
    isInstant: isInstantMode,
    isDragging,
    isRepeatedClickAdvance: state.isRepeatedClickAdvance,
    segmentStartVirtualIndex: state.fromVirtualIndex,
    targetVirtualIndex: state.virtualIndex,
    stepSize,
    snapBackDuration: config.motion.snapBackDuration,
    repeatedClickSpeedMultiplier: config.repeatedClick.speedMultiplier,
    autoplayDuration: config.autoplayDuration,
    stepDuration: config.stepDuration,
    jumpDuration: config.jumpDuration,
    gestureReleaseDuration: baseRelease.duration,
  });

  const moveSpeed = normalSpeed(stepSize, config.stepDuration);
  const fallbackMoveSpeed = moveSpeed || averageSpeed(state.virtualIndex - start.position, duration);

  if (intent === "repeated-click") {
    return {
      intent,
      duration,
      isInertialRelease: false,
      segment: buildRepeatedProfile(
        state,
        start,
        duration,
        startedAt,
        config.repeatedClick,
        state.followUpVirtualIndex !== null,
        fallbackMoveSpeed,
      ),
    };
  }

  if (intent === "gesture-release" && baseRelease.isInertialRelease) {
    return {
      intent,
      duration,
      isInertialRelease: true,
      segment: buildGestureProfile(
        state,
        start,
        duration,
        startedAt,
        config.releaseConfig,
        baseRelease.effectiveReleaseSpeed,
      ),
    };
  }

  if (intent === "gesture-release") {
    return {
      intent,
      duration,
      isInertialRelease: false,
      segment: buildEasing(state, start, duration, startedAt, true),
    };
  }

  if (isRepeatedFollowUp) {
    return {
      intent,
      duration,
      isInertialRelease: false,
      segment: buildRepeatedFollowUpProfile(
        state,
        start,
        duration,
        startedAt,
        config.repeatedClick,
        fallbackMoveSpeed,
      ),
    };
  }

  if (
    state.moveReason === "click" &&
    state.motionPhase !== "step-jump" &&
    sameDirectionSpeed(start.velocity, state.virtualIndex - start.position) > config.motion.epsilon
  ) {
    return {
      intent,
      duration,
      isInertialRelease: false,
      segment: buildHandoffProfile(state, start, duration, startedAt, fallbackMoveSpeed),
    };
  }

  return {
    intent,
    duration,
    isInertialRelease: false,
    segment: buildEasing(state, start, duration, startedAt, false),
  };
}
