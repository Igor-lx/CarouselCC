import type {
  InertialReleaseConfig,
  PointerSwipeConfig,
} from "../../../shared";

export interface PropDerivedSettings {
  visibleSlidesCount: number;
  autoplayDuration: number;
  stepDuration: number;
  /**
   * GO_TO peak cruise speed relative to a normal one-step MOVE. The jump
   * duration is derived from distance and this multiplier, so short and far
   * jumps keep a consistent visual speed.
   */
  jumpSpeedMultiplier: number;
  autoplayInterval: number;
  errorAltPlaceholder: string;
}

export interface MotionSettings {
  snapBackDuration: number;
  epsilon: number;
  /** @see GO_TO_MAX_ANIMATED_PAGE_SPAN */
  goToMaxAnimatedPageSpan: number;
  /** @see GO_TO_ACCELERATION_DISTANCE_SHARE */
  goToAccelerationDistanceShare: number;
  /** @see GO_TO_DECELERATION_DISTANCE_SHARE */
  goToDecelerationDistanceShare: number;
}

export interface RepeatedClickSettings {
  speedMultiplier: number;
  accelerationDistanceShare: number;
  decelerationDistanceShare: number;
}

export interface InteractionSettings {
  hoverPauseDelay: number;
  visibilityThreshold: number;
  autoplayPaginationFactor: number;
}

export interface LayoutSettings {
  renderWindowBufferMultiplier: number;
}

export interface CarouselRuntimeConfig extends PropDerivedSettings {
  motion: MotionSettings;
  repeatedClick: RepeatedClickSettings;
  interaction: InteractionSettings;
  layout: LayoutSettings;
  swipeConfig: Required<PointerSwipeConfig>;
  releaseConfig: InertialReleaseConfig;
  dragReleaseEpsilon: number;
}

export interface RawConfigInput {
  visibleSlidesNr?: unknown;
  durationAutoplay?: unknown;
  durationStep?: unknown;
  jumpSpeedMultiplier?: unknown;
  intervalAutoplay?: unknown;
  errAltPlaceholder?: unknown;
}
