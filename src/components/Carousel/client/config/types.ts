import type { CarouselInertialReleaseConfig, CarouselSwipeConfig } from "./gesture";

export interface PropDerivedSettings {
  visibleSlidesCount: number;
  autoplayDuration: number;
  stepDuration: number;
  autoplayInterval: number;
  errorAltPlaceholder: string;
}

/**
 * Distance shares of one accel/cruise/decel motion profile — the universal
 * shape every carousel motion is expressed in (there are no easing curves).
 */
export interface MotionProfileSharesSettings {
  accelerationDistanceShare: number;
  decelerationDistanceShare: number;
}

export interface MotionSettings {
  snapBackDuration: number;
  epsilon: number;
  /** Click step / non-inertial gesture release profile shape. */
  stepProfile: MotionProfileSharesSettings;
  /** Autoplay step profile shape. */
  autoplayProfile: MotionProfileSharesSettings;
  /** No-intent drag-release snap-back profile shape. */
  snapBackProfile: MotionProfileSharesSettings;
  /** @see GO_TO_PREFLIGHT_PAGE_SPAN */
  goToPreflightPageSpan: number;
  /** @see GO_TO_TELEPORT_ENABLED */
  goToTeleportEnabled: boolean;
  /** @see GO_TO_TELEPORT_MIN_PAGE_SPAN */
  goToTeleportMinPageSpan: number;
  /** @see GO_TO_FINAL_APPROACH_PAGE_SPAN */
  goToFinalApproachPageSpan: number;
  /** @see GO_TO_ACCELERATION_DISTANCE_SHARE */
  goToAccelerationDistanceShare: number;
  /** @see GO_TO_DECELERATION_DISTANCE_SHARE */
  goToDecelerationDistanceShare: number;
  /** @see GO_TO_SPEED_MULTIPLIER */
  goToSpeedMultiplier: number;
}

export interface RepeatedClickSettings {
  speedMultiplier: number;
  accelerationDistanceShare: number;
  decelerationDistanceShare: number;
}

export interface InteractionSettings {
  hoverPauseDelay: number;
  visibilityThreshold: number;
  /** Quiet window after glass/viewport activity before an autoplay tick may
   * fire (see AUTOPLAY_RESETTLE_DELAY_MS). */
  autoplayResettleDelayMs: number;
}

export interface LayoutSettings {
  renderWindowBufferMultiplier: number;
}

export interface CarouselRuntimeConfig extends PropDerivedSettings {
  motion: MotionSettings;
  repeatedClick: RepeatedClickSettings;
  interaction: InteractionSettings;
  layout: LayoutSettings;
  swipeConfig: CarouselSwipeConfig;
  releaseConfig: CarouselInertialReleaseConfig;
  dragReleaseEpsilon: number;
  /** @see GESTURE_COAST_MAX_MS */
  gestureCoastMaxMs: number;
}

export interface RawConfigInput {
  visibleSlidesNr?: unknown;
  durationAutoplay?: unknown;
  durationStep?: unknown;
  intervalAutoplay?: unknown;
  errAltPlaceholder?: unknown;
}
