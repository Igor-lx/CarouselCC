// Swipe + inertial-release feel.
// See docs/config/gesture.md for what each field governs;


import type {
  CarouselInertialReleaseConfig,
  CarouselSwipeConfig,
} from "./types";


export const CAROUSEL_SWIPE_CONFIG: CarouselSwipeConfig = {
  cooldownMs: 150,
  intentThreshold: 8,
  resistance: 0.33,
  resistanceCurvature: 0.0046,
  maxVelocity: 4,
  emaAlpha: 0.85,
  quickFlickVelocity: 0.25,
  quickFlickMinOffset: 20,
  flickVelocityAlpha: 0.45,
  flickPauseGraceMs: 120,
  flickVelocityHalfLifeMs: 250,
  catchDelayMs: 250,
  commit: {
    slotShare: 0.3,
    minPx: 20,
    maxPx: 120,
  },
};

export const CAROUSEL_INERTIAL_RELEASE_CONFIG: CarouselInertialReleaseConfig = {
  inertiaBoost: 1.45,
  accelerationDistanceShare: 0.25,
  decelerationDistanceShare: 0.45,
  minRideDurationMs: 210,
};
