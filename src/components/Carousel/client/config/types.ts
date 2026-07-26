import type {
  InertialReleaseConfig,
  PointerSwipeConfig,
} from "../../../../shared";

export interface CarouselInertialReleaseConfig extends InertialReleaseConfig {
  accelerationDistanceShare: number;
  decelerationDistanceShare: number;
  minRideDurationMs: number;
}

export interface SwipeCommitConfig {
  slotShare: number;
  minPx: number;
  maxPx: number;
}


export type CarouselSwipeConfig = Omit<
  Required<PointerSwipeConfig>,
  "minSwipeDistance" | "swipeThresholdRatio"
> & { commit: SwipeCommitConfig };

export interface PropDerivedSettings {
  visibleSlidesCount: number;
  autoplayDuration: number;
  stepDuration: number;
  autoplayInterval: number;
  errorAltPlaceholder: string;
}


export interface MotionProfileSharesSettings {
  accelerationDistanceShare: number;
  decelerationDistanceShare: number;
}

export interface MotionSettings {
  snapBackDuration: number;
  epsilon: number;
  stepProfile: MotionProfileSharesSettings;
  autoplayProfile: MotionProfileSharesSettings;
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
