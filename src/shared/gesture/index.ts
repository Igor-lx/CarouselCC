/**
 * The pointer-swipe gesture engine — one self-sufficient facade. Everything a
 * component needs to wire touch gestures comes from here: the hook, the
 * release-speed helpers, the engine defaults, the drag-ignore escape hatch,
 * and every public type. See README.md in this folder for the full contract.
 * The `internals/` folder is the engine's private machinery — import only
 * from this facade.
 */
export { usePointerSwipe, POINTER_SWIPE_DEFAULTS } from "./usePointerSwipe";
export { resolveInertialRelease } from "./inertialRelease";
export { DRAG_IGNORE_ATTRIBUTE, sameDirectionSpeed } from "./internals/index";
export type {
  InertialReleaseConfig,
  InertialReleaseResult,
} from "./inertialRelease";
export type {
  PointerSwipeConfig,
  ResolvedPointerSwipeConfig,
  PointerSwipeListeners,
  PointerSwipeMovePayload,
  PointerSwipeProps,
  PointerSwipeReleasePayload,
  PointerSwipeResult,
  PointerSwipeDirection,
} from "./types";
