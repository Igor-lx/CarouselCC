import type {
  InertialReleaseConfig,
  PointerSwipeConfig,
} from "../../../shared";

export const CAROUSEL_SWIPE_CONFIG: Required<PointerSwipeConfig> = {
  cooldownMs: 150,
  intentThreshold: 8,
  resistance: 0.53,
  resistanceCurvature: 0.0045,
  maxVelocity: 5,
  emaAlpha: 0.85,
  quickFlickVelocity: 0.1,
  quickFlickMinOffset: 6,
  minSwipeDistance: 20,
  swipeThresholdRatio: 0.23,
};

export const CAROUSEL_INERTIAL_RELEASE_CONFIG: InertialReleaseConfig = {
  inertiaBoost: 2.15,
  decelerationDistanceShare: 0.25,
};
