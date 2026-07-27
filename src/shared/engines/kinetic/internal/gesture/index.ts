// Internal fork of shared/gesture (duplicated, not imported; may drift — by
// design). Physics/traps documented in shared/gesture/README.md.
export { usePointerSwipe, POINTER_SWIPE_DEFAULTS } from "./swipe/usePointerSwipe";
export { DRAG_IGNORE_ATTRIBUTE } from "./swipe/internals/index";
export type {
  PointerSwipeConfig,
  ResolvedPointerSwipeConfig,
  PointerSwipeHostProps,
  PointerSwipeHostRef,
  PointerSwipeListeners,
  PointerSwipeMovePayload,
  PointerSwipeProps,
  PointerSwipeReleasePayload,
  PointerSwipeResult,
  PointerSwipeDirection,
  PointerSwipeValueBinding,
} from "./swipe/types";
export { resolveInertialRelease } from "./inertia/inertialRelease";
export { resolveReleaseLaunch } from "./inertia/releaseLaunch";
export { sameDirectionSpeed } from "./inertia/speed";
export type {
  InertialReleaseConfig,
  InertialReleaseResult,
} from "./inertia/inertialRelease";
export type {
  ReleaseLaunch,
  ReleaseLaunchInput,
} from "./inertia/releaseLaunch";
