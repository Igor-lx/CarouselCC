import type {
  InertialReleaseConfig,
  PointerSwipeConfig,
} from "../../../../shared";

/**
 * The engine's release config plus the carousel's own profile knob: how much
 * of the remaining distance the release segment devotes to deceleration. The
 * share is consumed by the carousel's segment factory, not by the engine.
 */
export interface CarouselInertialReleaseConfig extends InertialReleaseConfig {
  decelerationDistanceShare: number;
}

/**
 * Drag/swipe tuning specific to the carousel. These values control the *feel*
 * of touch dragging and are part of the visual contract.
 */
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

/**
 * Inertial release tuning. `inertiaBoost` makes a fast swipe land faster than
 * a passive base duration would imply; the deceleration share shapes the
 * smooth tail.
 */
export const CAROUSEL_INERTIAL_RELEASE_CONFIG: CarouselInertialReleaseConfig = {
  inertiaBoost: 2.15,
  decelerationDistanceShare: 0.25,
};
