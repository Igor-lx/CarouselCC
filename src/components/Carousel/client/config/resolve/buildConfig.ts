// See docs/adr/0002-trusted-runtime-inputs.md — inputs are caller-owned and
// are not repaired here.
import { CAROUSEL_DEFAULTS } from "../defaults";
import { RENDER_WINDOW_BUFFER_MULTIPLIER } from "../layout";
import { MOTION_EPSILON } from "../../motion/tolerances";
import { DRAG_RELEASE_EPSILON } from "../../domain";
import { GESTURE_COAST_MAX_MS } from "../../gesture/coast";
import {
  CAROUSEL_SWIPE_CONFIG,
  CAROUSEL_INERTIAL_RELEASE_CONFIG,
} from "../gesture";
import {
  AUTOPLAY_ACCELERATION_DISTANCE_SHARE,
  AUTOPLAY_DECELERATION_DISTANCE_SHARE,
  GO_TO_ACCELERATION_DISTANCE_SHARE,
  GO_TO_DECELERATION_DISTANCE_SHARE,
  GO_TO_FINAL_APPROACH_PAGE_SPAN,
  GO_TO_PREFLIGHT_PAGE_SPAN,
  GO_TO_TELEPORT_ENABLED,
  GO_TO_SPEED_MULTIPLIER,
  GO_TO_TELEPORT_MIN_PAGE_SPAN,
  REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE,
  REPEATED_CLICK_DECELERATION_DISTANCE_SHARE,
  REPEATED_CLICK_SPEED_MULTIPLIER,
  SNAP_BACK_ACCELERATION_DISTANCE_SHARE,
  SNAP_BACK_DECELERATION_DISTANCE_SHARE,
  SNAP_BACK_DURATION_MS,
  STEP_ACCELERATION_DISTANCE_SHARE,
  STEP_DECELERATION_DISTANCE_SHARE,
} from "../motion";
import {
  PAUSE_HOVER_DELAY_MS,
  PAUSE_VISIBILITY_RATIO,
  AUTOPLAY_RESETTLE_DELAY_MS,
} from "../interaction";
import type { CarouselRuntimeConfig, RawConfigInput } from "../types";

const withDefault = <T>(value: unknown, fallback: T): T =>
  typeof value === "undefined" ? fallback : (value as T);

export const buildCarouselConfig = ({
  visibleSlidesNr,
  durationAutoplay,
  durationStep,
  intervalAutoplay,
  errAltPlaceholder,
}: RawConfigInput): CarouselRuntimeConfig => ({
  visibleSlidesCount: withDefault(
    visibleSlidesNr,
    CAROUSEL_DEFAULTS.visibleSlidesNr,
  ),
  autoplayDuration: withDefault(
    durationAutoplay,
    CAROUSEL_DEFAULTS.durationAutoplay,
  ),
  stepDuration: withDefault(durationStep, CAROUSEL_DEFAULTS.durationStep),
  autoplayInterval: withDefault(
    intervalAutoplay,
    CAROUSEL_DEFAULTS.intervalAutoplay,
  ),
  errorAltPlaceholder: withDefault(
    errAltPlaceholder,
    CAROUSEL_DEFAULTS.errAltPlaceholder,
  ),
  motion: {
    snapBackDurationMs: SNAP_BACK_DURATION_MS,
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
    goToTeleportEnabled: GO_TO_TELEPORT_ENABLED,
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
    hoverPauseDelayMs: PAUSE_HOVER_DELAY_MS,
    visibilityRatio: PAUSE_VISIBILITY_RATIO,
    autoplayResettleDelayMs: AUTOPLAY_RESETTLE_DELAY_MS,
  },
  layout: {
    renderWindowBufferMultiplier: RENDER_WINDOW_BUFFER_MULTIPLIER,
  },
  swipeConfig: {
    ...CAROUSEL_SWIPE_CONFIG,
    commit: { ...CAROUSEL_SWIPE_CONFIG.commit },
  },
  releaseConfig: { ...CAROUSEL_INERTIAL_RELEASE_CONFIG },
  dragReleaseEpsilon: DRAG_RELEASE_EPSILON,
  gestureCoastMaxMs: GESTURE_COAST_MAX_MS,
});
