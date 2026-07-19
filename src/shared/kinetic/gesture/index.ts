/**
 * INTERNAL FORK of `shared/gesture` — deliberately duplicated, not imported.
 * The kinetic blank is a single-folder, copy-and-go library; each blank in
 * the collection is self-sufficient by contract, so it carries its own copy
 * of everything it stands on. This copy may drift from the standalone
 * original as the blank evolves — that is the point, not a bug.
 */
/**
 * The GESTURE library — everything for touch (finger) control, one facade.
 * Sub-modules by concern: `swipe/` — gesture registration (the hook, host
 * props, recognition); `inertia/` — the kinetic meaning of a release
 * (intent speed, continuity launch). See README.md for the quick start and
 * the standard rig with the `motion` library (referenced by name — this
 * folder imports nothing outside itself, so it can be copied alone).
 */
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
