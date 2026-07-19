/**
 * The MOTION library — everything to make a numeric value travel beautifully,
 * one facade, gesture-agnostic. Sub-modules by concern: `profile/` — the
 * curve mathematics (accel/cruise/decel profiles, percent-progress stops for
 * WAAPI keyframe transport, peak-speed solver, WAAPI gate); `runtime/` — the
 * execution engine (RAF controller, the motion clock). See README.md; this
 * folder imports nothing outside itself, so it can be copied alone.
 */
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
  normalizeMotionProfileShares,
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
  resolvePeakSpeedForDuration,
  sampleProgressStops,
} from "./profile/progressCurve";
export type { InFlightSpan } from "./profile/progressCurve";
export { startPinnedAnimation } from "./compositor/pinnedAnimation";
export type { PinnedAnimationTiming } from "./compositor/pinnedAnimation";
