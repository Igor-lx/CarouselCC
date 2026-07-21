/**
 * The MEDIA LIBRARY — individual, standalone media-condition hooks. Each is
 * usable on its own: grab exactly the one you need, and take
 * `../../shared/useMediaQuery` along with it. That store is the ONLY file
 * these hooks import from outside this folder, and a project must hold
 * exactly ONE of it however many blanks were copied.
 *
 * A general toolkit for any consumer — NOT shaped by any particular
 * component. The `../useMedia` facade keeps its OWN copies of these hooks
 * (see its internal/) so it can be lifted independently; both sides still
 * share that single store.
 */
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
