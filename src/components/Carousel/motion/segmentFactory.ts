import {
  resolveInertialRelease,
  type InertialReleaseConfig,
} from "../../../shared";
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

/**
 * Fast acceleration profile for a repeated click - a same-direction click
 * that arrives while the carousel is already moving. The segment drives
 * straight to the page boundary (`state.virtualIndex`) and decays to zero
 * speed; there is no intermediate target and no chained follow-up.
 */
const buildRepeatedProfile = (
  state: CarouselState,
  start: MotionStart,
  duration: number,
  startedAt: number,
  repeated: RepeatedClickSettings,
  normalMoveSpeed: number,
): ProfileSegment => {
  const distance = state.virtualIndex - start.position;
  const peakVelocity = signedVelocity(
    normalMoveSpeed * Math.max(1, repeated.speedMultiplier),
    distance,
  );

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
      endSpeed: 0,
      accelerationDistanceShare: repeated.accelerationDistanceShare,
      decelerationDistanceShare: repeated.decelerationDistanceShare,
      targetDuration: duration,
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
  const baseRelease =
    intent === "gesture-release"
      ? resolveInertialRelease({
          gestureReleaseVelocity: state.gesture.pointerVelocity,
          distanceToTarget: state.virtualIndex - state.fromVirtualIndex,
          baseDuration:
            stepSize > 0
              ? config.stepDuration *
                Math.abs(state.virtualIndex - state.fromVirtualIndex) /
                stepSize
              : config.stepDuration,
          config: config.releaseConfig,
        })
      : null;

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
    gestureReleaseDuration: baseRelease?.duration ?? config.stepDuration,
  });

  const moveSpeed = averageSpeed(stepSize, config.stepDuration);
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
        fallbackMoveSpeed,
      ),
    };
  }

  if (intent === "gesture-release" && baseRelease?.isInertialRelease) {
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

  return {
    intent,
    duration,
    isInertialRelease: false,
    segment: buildEasing(state, start, duration, startedAt, false),
  };
}
