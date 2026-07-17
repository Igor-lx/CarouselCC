import { CAROUSEL_DEFAULTS } from "./defaults";
import {
  DRAG_RELEASE_EPSILON,
  GESTURE_COAST_MAX_MS,
  MOTION_EPSILON,
  RENDER_WINDOW_BUFFER_MULTIPLIER,
} from "./constants";
import { CAROUSEL_SWIPE_CONFIG, CAROUSEL_INERTIAL_RELEASE_CONFIG } from "./gesture";
import {
  AUTOPLAY_ACCELERATION_DISTANCE_SHARE,
  AUTOPLAY_DECELERATION_DISTANCE_SHARE,
  GO_TO_ACCELERATION_DISTANCE_SHARE,
  GO_TO_DECELERATION_DISTANCE_SHARE,
  GO_TO_FINAL_APPROACH_PAGE_SPAN,
  GO_TO_PREFLIGHT_PAGE_SPAN,
  GO_TO_TELEPORT_MIN_PAGE_SPAN,
  REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE,
  REPEATED_CLICK_DECELERATION_DISTANCE_SHARE,
  REPEATED_CLICK_SPEED_MULTIPLIER,
  SNAP_BACK_ACCELERATION_DISTANCE_SHARE,
  SNAP_BACK_DECELERATION_DISTANCE_SHARE,
  SNAP_BACK_DURATION,
  STEP_ACCELERATION_DISTANCE_SHARE,
  STEP_DECELERATION_DISTANCE_SHARE,
} from "./motion";
import { HOVER_PAUSE_DELAY, VISIBILITY_THRESHOLD, AUTOPLAY_RESETTLE_DELAY_MS } from "./interaction";
import {
  SCROLL_YIELD_BRAKE_DURATION_MS,
  SCROLL_YIELD_CRAWL_SPEED_SHARE,
  SCROLL_YIELD_RESUME_DECELERATION_DISTANCE_SHARE,
  SCROLL_YIELD_RESUME_QUIET_DELAY_MS,
  SCROLL_YIELD_RESUME_RAMP_DURATION_MS,
} from "./scrollYield";
import type { CarouselRuntimeConfig, RawConfigInput } from "./types";

const useDefault = <T>(value: unknown, fallback: T): T =>
  typeof value === "undefined" ? fallback : (value as T);

/**
 * Assemble the runtime config. Defaults are applied only when a prop is
 * `undefined`; any explicitly-provided value flows through unchanged. The
 * carousel intentionally trusts its inputs - see the diagnostic layer for
 * observability.
 */
export const buildCarouselConfig = ({
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
    stepProfile: {
      accelerationDistanceShare: STEP_ACCELERATION_DISTANCE_SHARE,
      decelerationDistanceShare: STEP_DECELERATION_DISTANCE_SHARE,
    },
    autoplayProfile: {
      accelerationDistanceShare: AUTOPLAY_ACCELERATION_DISTANCE_SHARE,
      decelerationDistanceShare: AUTOPLAY_DECELERATION_DISTANCE_SHARE,
    },
    snapBackProfile: {
      accelerationDistanceShare: SNAP_BACK_ACCELERATION_DISTANCE_SHARE,
      decelerationDistanceShare: SNAP_BACK_DECELERATION_DISTANCE_SHARE,
    },
    goToPreflightPageSpan: GO_TO_PREFLIGHT_PAGE_SPAN,
    goToTeleportMinPageSpan: GO_TO_TELEPORT_MIN_PAGE_SPAN,
    goToFinalApproachPageSpan: GO_TO_FINAL_APPROACH_PAGE_SPAN,
    goToAccelerationDistanceShare: GO_TO_ACCELERATION_DISTANCE_SHARE,
    goToDecelerationDistanceShare: GO_TO_DECELERATION_DISTANCE_SHARE,
  },
  repeatedClick: {
    speedMultiplier: REPEATED_CLICK_SPEED_MULTIPLIER,
    accelerationDistanceShare: REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE,
    decelerationDistanceShare: REPEATED_CLICK_DECELERATION_DISTANCE_SHARE,
  },
  interaction: {
    hoverPauseDelay: HOVER_PAUSE_DELAY,
    visibilityThreshold: VISIBILITY_THRESHOLD,
    autoplayResettleDelayMs: AUTOPLAY_RESETTLE_DELAY_MS,
  },
  layout: {
    renderWindowBufferMultiplier: RENDER_WINDOW_BUFFER_MULTIPLIER,
  },
  scrollYield: {
    crawlSpeedShare: SCROLL_YIELD_CRAWL_SPEED_SHARE,
    brakeDurationMs: SCROLL_YIELD_BRAKE_DURATION_MS,
    resumeQuietDelayMs: SCROLL_YIELD_RESUME_QUIET_DELAY_MS,
    resumeRampDurationMs: SCROLL_YIELD_RESUME_RAMP_DURATION_MS,
    resumeDecelerationDistanceShare: SCROLL_YIELD_RESUME_DECELERATION_DISTANCE_SHARE,
  },
  swipeConfig: { ...CAROUSEL_SWIPE_CONFIG },
  releaseConfig: { ...CAROUSEL_INERTIAL_RELEASE_CONFIG },
  dragReleaseEpsilon: DRAG_RELEASE_EPSILON,
  gestureCoastMaxMs: GESTURE_COAST_MAX_MS,
});
