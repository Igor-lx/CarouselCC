/**
 * Media-condition signals — everything that answers "does this CSS media
 * query match right now", built on the ONE shared store in `useMediaQuery`
 * (a single MediaQueryList listener per distinct query, app-wide).
 *
 * Named wrappers live here when the condition has a stable meaning of its
 * own (`useIsReducedMotion`, `useBreakpoint`, `useCompactLandscape`).
 * Signals that mix media with non-media sources (`useIsTouchDevice`'s
 * pointerdown detection, `useDataSaver`'s Network Information API) keep
 * their custom stores in `hooks/`.
 */
export { useMediaQuery } from "./useMediaQuery";
export { useIsReducedMotion } from "./useIsReducedMotion";
export { useBreakpoint } from "./useBreakpoint";
export type { Breakpoint } from "./useBreakpoint";
export {
  useCompactLandscape,
  COMPACT_LANDSCAPE_QUERY,
} from "./useCompactLandscape";
