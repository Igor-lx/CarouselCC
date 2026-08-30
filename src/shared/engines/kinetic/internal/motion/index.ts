// Internal fork of shared/motion (duplicated, not imported; may drift — by
// design). Curve math + runtime traps documented in shared/engines/motion/README.md.
export { createMotionController } from "./runtime/createMotionController";
export { useMotionController } from "./runtime/useMotionController";
export { useMotionPaint } from "./runtime/useMotionPaint";
export { motionNow } from "./runtime/clock";
export type {
  MotionController,
  MotionSample,
  MotionSampleData,
  MotionHandoff,
  MotionPhase,
  MotionSegmentBase,
  MotionSegmentSampler,
  MotionStartOptions,
  MotionSetOptions,
  MotionSnapOptions,
  MotionSubscriber,
  MotionCompletionMode,
} from "./runtime/types";
export {
  buildProfile,
  createMotionProfile,
  sampleMotionProfile,
} from "./profile/profile";
export type { MotionProfile, MotionProfileZone } from "./profile/profile";
export {
  alignSpeed,
  createProfileSegment,
  sampleProfileSegment,
} from "./profile/profileSegment";
export type {
  CreateProfileSegmentInput,
  ProfileSegment,
} from "./profile/profileSegment";
export {
  isWaapiSupported,
  keyframesAlongStops,
  positionAtNow,
  profileProgressStops,
  resampleStops,
  resolvePeakSpeedForDuration,
  sampleProgressStops,
} from "./profile/progressCurve";
export type { InFlightSpan } from "./profile/progressCurve";
export { startPinnedAnimation } from "./compositor/pinnedAnimation";
export { applyKeyframe } from "./compositor/compositedRide";
export {
  createCompositedRide,
  useCompositedRide,
} from "./compositor/compositedRide";
export type {
  CompositedRide,
  CompositedRideStart,
} from "./compositor/compositedRide";
export type { PinnedAnimationTiming } from "./compositor/pinnedAnimation";
