/**
 * THE CONTRACT OF `config/`: everything in this folder is a TUNABLE — a
 * feel, product or performance knob a developer may change freely to taste,
 * with every value guarded by the Diagnostic layer. Each file groups the
 * knobs of one concern (motion, gesture, interaction, layout, slides,
 * legacy paint pacing). Implementation constants (tolerances, sanity clamps,
 * calibration records, private thresholds) do NOT live here — they live WITH
 * the code they serve, documented in place (e.g. `MOTION_EPSILON` in
 * motion/, `DRAG_RELEASE_EPSILON` in domain/dragRelease.ts,
 * `GESTURE_COAST_MAX_MS` in gesture/coast.ts, `SWIPE_REFERENCE_SLOT_PX` in
 * gesture/slotAdaptiveSwipe.ts). If changing a value requires understanding
 * the algorithm around it, it does not belong in this folder.
 */
export { CAROUSEL_DEFAULTS } from "./defaults";
export { RENDER_WINDOW_BUFFER_MULTIPLIER } from "./layout";
export { FALLBACK_DROP_EVERY_NTH_FRAME } from "./legacyPaint";
export {
  SNAP_BACK_DURATION,
  REPEATED_CLICK_SPEED_MULTIPLIER,
  REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE,
  REPEATED_CLICK_DECELERATION_DISTANCE_SHARE,
  GO_TO_PREFLIGHT_PAGE_SPAN,
  GO_TO_TELEPORT_ENABLED,
  GO_TO_FINAL_APPROACH_PAGE_SPAN,
  GO_TO_TELEPORT_MIN_PAGE_SPAN,
  GO_TO_ACCELERATION_DISTANCE_SHARE,
  GO_TO_DECELERATION_DISTANCE_SHARE,
  GO_TO_SPEED_MULTIPLIER,
  STEP_ACCELERATION_DISTANCE_SHARE,
  STEP_DECELERATION_DISTANCE_SHARE,
  AUTOPLAY_ACCELERATION_DISTANCE_SHARE,
  AUTOPLAY_DECELERATION_DISTANCE_SHARE,
  SNAP_BACK_ACCELERATION_DISTANCE_SHARE,
  SNAP_BACK_DECELERATION_DISTANCE_SHARE,
} from "./motion";
export {
  HOVER_PAUSE_DELAY,
  VISIBILITY_THRESHOLD,
  AUTOPLAY_RESETTLE_DELAY_MS,
  REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES,
} from "./interaction";
export {
  CAROUSEL_SWIPE_CONFIG,
  CAROUSEL_INERTIAL_RELEASE_CONFIG,
  SWIPE_COMMIT_SLOT_SHARE,
  SWIPE_COMMIT_MIN_PX,
  SWIPE_COMMIT_MAX_PX,
} from "./gesture";
export {
  IMAGE_RETRY_BASE_DELAY_MS,
  IMAGE_RETRY_MAX_DELAY_MS,
  IMAGE_RETRY_MAX_ATTEMPTS,
  SLIDE_REORIENT_FADE_IN_MS,
  SLIDE_REORIENT_FADE_OUT_MS,
  SLIDE_REORIENT_VEIL_MAX_MS,
} from "./slides";
export {
  SLIDE_VIEWPORT_BREAKPOINTS,
  SLIDE_VIEWPORT_BASE_BREAKPOINT,
  SLIDE_VIEWPORT_FLAGS,
  SLIDE_VIEWPORT_AXES,
  SLIDE_CANONICAL_SOURCE_MEDIA,
} from "./viewport";
export type {
  SlideViewportBreakpoint,
  SlideViewportFlag,
} from "./viewport";
export { buildCarouselConfig } from "./buildConfig";
export { useCarouselConfig } from "./useCarouselConfig";
export type {
  CarouselRuntimeConfig,
  RawConfigInput,
  PropDerivedSettings,
  MotionSettings,
  MotionProfileSharesSettings,
  RepeatedClickSettings,
  InteractionSettings,
  LayoutSettings,
} from "./types";
export type { CarouselInertialReleaseConfig } from "./gesture";
