// The gesture library facade: swipe/ (registration) + inertia/ (release meaning).
// Imports nothing outside itself → copy-portable. See README.md.
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
export {
  MOMENTUM_DEFAULTS,
  projectMomentum,
  RELEASE_KINETICS_DEFAULTS,
  resolveReleaseKinetics,
} from "./inertia/releaseKinetics";
export type {
  MomentumConfig,
  ReleaseKinetics,
  ReleaseKineticsConfig,
  ReleaseKineticsInput,
} from "./inertia/releaseKinetics";
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
