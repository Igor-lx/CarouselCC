/**
 * The MEDIA LIBRARY — individual, standalone media-condition hooks. Each is
 * usable on its own (grab exactly the one you need); they all sit on the ONE
 * shared store in `useMediaQuery` (a single MediaQueryList listener per
 * distinct query, app-wide). A general toolkit for any consumer — NOT shaped
 * by any particular component's needs. The `../useMedia` facade mirrors
 * these (by duplication — see its internal/).
 */
export { useMediaQuery } from "./useMediaQuery";
export {
  useBreakpoint,
  resolveActiveBreakpoint,
  sortedBreakpointEntries,
  breakpointMinWidthQuery,
  STANDARD_BREAKPOINTS,
} from "./useBreakpoint";
export type { BreakpointState, BreakpointTable } from "./useBreakpoint";
export {
  useOrientation,
  PORTRAIT_ORIENTATION_QUERY,
  LANDSCAPE_ORIENTATION_QUERY,
} from "./useOrientation";
export type { ViewportOrientation } from "./useOrientation";
export {
  useShortLandscape,
  SHORT_LANDSCAPE_QUERY,
} from "./useShortLandscape";
