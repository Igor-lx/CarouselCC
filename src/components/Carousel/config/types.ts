import type {
  InertialReleaseConfig,
  PointerSwipeConfig,
} from "../../../shared";

export interface PropDerivedSettings {
  visibleSlidesCount: number;
  autoplayDuration: number;
  stepDuration: number;
  jumpDuration: number;
  autoplayInterval: number;
  errorAltPlaceholder: string;
}

export interface MotionSettings {
  snapBackDuration: number;
  epsilon: number;
}

export interface RepeatedClickSettings {
  destinationPosition: number;
  touchDestinationPosition: number;
  speedMultiplier: number;
  accelerationDistanceShare: number;
  decelerationDistanceShare: number;
  epsilon: number;
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
  durationJump?: unknown;
  intervalAutoplay?: unknown;
  errAltPlaceholder?: unknown;
}

/** A diagnostic slot may expose this resolver to take over config resolution. */
export type CarouselDiagnosticResolver = (input: RawConfigInput) => {
  config: CarouselRuntimeConfig;
  notices: import("../../../shared").DevNoticeEntry[];
};
