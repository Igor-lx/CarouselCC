/**
 * Viewport / layout media conditions — everything that answers "does this
 * CSS media query match right now", built on the ONE shared store in
 * `useMediaQuery` (a single MediaQueryList listener per distinct query,
 * app-wide). Named wrappers live here when the condition has a stable
 * layout meaning of its own.
 */
export { useMediaQuery } from "./useMediaQuery";
export { useBreakpoint } from "./useBreakpoint";
export type { Breakpoint } from "./useBreakpoint";
export {
  useCompactLandscape,
  COMPACT_LANDSCAPE_QUERY,
} from "./useCompactLandscape";
