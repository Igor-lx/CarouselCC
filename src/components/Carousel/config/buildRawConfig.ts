import { CAROUSEL_DEFAULTS } from "./defaults";
import {
  DRAG_RELEASE_EPSILON,
  MOTION_EPSILON,
  RENDER_WINDOW_BUFFER_MULTIPLIER,
} from "./constants";
import { CAROUSEL_SWIPE_CONFIG, CAROUSEL_INERTIAL_RELEASE_CONFIG } from "./gesture";
import {
  GO_TO_ACCELERATION_DISTANCE_SHARE,
  GO_TO_DECELERATION_DISTANCE_SHARE,
  GO_TO_FINAL_APPROACH_PAGE_SPAN,
  GO_TO_PREFLIGHT_PAGE_SPAN,
  REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE,
  REPEATED_CLICK_DECELERATION_DISTANCE_SHARE,
  REPEATED_CLICK_RETARGET_FRAME_DELAY,
  REPEATED_CLICK_SPEED_MULTIPLIER,
  SNAP_BACK_DURATION,
} from "./motion";
import {
  AUTOPLAY_PAGINATION_FACTOR,
  HOVER_PAUSE_DELAY,
  VISIBILITY_THRESHOLD,
} from "./interaction";
import type { CarouselRuntimeConfig, RawConfigInput } from "./types";

const useDefault = <T>(value: unknown, fallback: T): T =>
  typeof value === "undefined" ? fallback : (value as T);

/**
 * Assemble the runtime config. Defaults are applied only when a prop is
 * `undefined`; any explicitly-provided value flows through unchanged. The
 * carousel intentionally trusts its inputs - see the diagnostic layer for
 * observability.
 */
export const buildRawCarouselConfig = ({
  visibleSlidesNr,
  durationAutoplay,
  durationStep,
  jumpSpeedMultiplier,
  intervalAutoplay,
  errAltPlaceholder,
}: RawConfigInput): CarouselRuntimeConfig => ({
  visibleSlidesCount: useDefault(visibleSlidesNr, CAROUSEL_DEFAULTS.visibleSlidesNr),
  autoplayDuration: useDefault(durationAutoplay, CAROUSEL_DEFAULTS.durationAutoplay),
  stepDuration: useDefault(durationStep, CAROUSEL_DEFAULTS.durationStep),
  jumpSpeedMultiplier: useDefault(
    jumpSpeedMultiplier,
    CAROUSEL_DEFAULTS.jumpSpeedMultiplier,
  ),
  autoplayInterval: useDefault(intervalAutoplay, CAROUSEL_DEFAULTS.intervalAutoplay),
  errorAltPlaceholder: useDefault(errAltPlaceholder, CAROUSEL_DEFAULTS.errAltPlaceholder),
  motion: {
    snapBackDuration: SNAP_BACK_DURATION,
    epsilon: MOTION_EPSILON,
    goToPreflightPageSpan: GO_TO_PREFLIGHT_PAGE_SPAN,
    goToFinalApproachPageSpan: GO_TO_FINAL_APPROACH_PAGE_SPAN,
    goToAccelerationDistanceShare: GO_TO_ACCELERATION_DISTANCE_SHARE,
    goToDecelerationDistanceShare: GO_TO_DECELERATION_DISTANCE_SHARE,
  },
  repeatedClick: {
    speedMultiplier: REPEATED_CLICK_SPEED_MULTIPLIER,
    accelerationDistanceShare: REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE,
    decelerationDistanceShare: REPEATED_CLICK_DECELERATION_DISTANCE_SHARE,
    retargetFrameDelay: REPEATED_CLICK_RETARGET_FRAME_DELAY,
  },
  interaction: {
    hoverPauseDelay: HOVER_PAUSE_DELAY,
    visibilityThreshold: VISIBILITY_THRESHOLD,
    autoplayPaginationFactor: AUTOPLAY_PAGINATION_FACTOR,
  },
  layout: {
    renderWindowBufferMultiplier: RENDER_WINDOW_BUFFER_MULTIPLIER,
  },
  swipeConfig: { ...CAROUSEL_SWIPE_CONFIG },
  releaseConfig: { ...CAROUSEL_INERTIAL_RELEASE_CONFIG },
  dragReleaseEpsilon: DRAG_RELEASE_EPSILON,
});
