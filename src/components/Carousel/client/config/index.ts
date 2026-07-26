// Taste-tunable knobs. A value whose change needs understanding the surrounding
// algorithm does not belong here. Per-file docs live in docs/config/.

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
} from "./gesture";
export { IMAGE_RETRY, SLIDE_REORIENT_VEIL } from "./slides";
export {
  SLIDE_VIEWPORT_BREAKPOINTS,
  SLIDE_VIEWPORT_BASE_BREAKPOINT,
  SLIDE_VIEWPORT_FLAGS,
  SLIDE_VIEWPORT_AXES,
  SLIDE_CANONICAL_SOURCE_MEDIA,
} from "./viewport";
export type { SlideViewportBreakpoint, SlideViewportFlag } from "./viewport";
export { buildCarouselConfig } from "./resolve/buildConfig";
export { useCarouselConfig } from "./resolve/useCarouselConfig";
export type {
  CarouselRuntimeConfig,
  RawConfigInput,
  PropDerivedSettings,
  MotionSettings,
  MotionProfileSharesSettings,
  RepeatedClickSettings,
  InteractionSettings,
  LayoutSettings,
  CarouselInertialReleaseConfig,
  CarouselSwipeConfig,
  SwipeCommitConfig,
} from "./types";
