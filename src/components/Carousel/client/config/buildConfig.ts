import { CAROUSEL_DEFAULTS } from "./defaults";
import { RENDER_WINDOW_BUFFER_MULTIPLIER } from "./constants";
// Implementation constants are colocated with their subsystems (see the
// contract note in ./constants.ts); the runtime config still plumbs them so
// consumers and tests keep one injection point.
import { MOTION_EPSILON } from "../motion/tolerances";
import { DRAG_RELEASE_EPSILON } from "../domain/dragRelease";
import { GESTURE_COAST_MAX_MS } from "../gesture/coast";
import { CAROUSEL_SWIPE_CONFIG, CAROUSEL_INERTIAL_RELEASE_CONFIG } from "./gesture";
import {
  AUTOPLAY_ACCELERATION_DISTANCE_SHARE,
  AUTOPLAY_DECELERATION_DISTANCE_SHARE,
  GO_TO_ACCELERATION_DISTANCE_SHARE,
  GO_TO_DECELERATION_DISTANCE_SHARE,
  GO_TO_FINAL_APPROACH_PAGE_SPAN,
  GO_TO_PREFLIGHT_PAGE_SPAN,
  GO_TO_SPEED_MULTIPLIER,
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
  intervalAutoplay,
  errAltPlaceholder,
}: RawConfigInput): CarouselRuntimeConfig => ({
  visibleSlidesCount: useDefault(visibleSlidesNr, CAROUSEL_DEFAULTS.visibleSlidesNr),
  autoplayDuration: useDefault(durationAutoplay, CAROUSEL_DEFAULTS.durationAutoplay),
  stepDuration: useDefault(durationStep, CAROUSEL_DEFAULTS.durationStep),
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
    goToSpeedMultiplier: GO_TO_SPEED_MULTIPLIER,
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
  swipeConfig: { ...CAROUSEL_SWIPE_CONFIG },
  releaseConfig: { ...CAROUSEL_INERTIAL_RELEASE_CONFIG },
  dragReleaseEpsilon: DRAG_RELEASE_EPSILON,
  gestureCoastMaxMs: GESTURE_COAST_MAX_MS,
});
