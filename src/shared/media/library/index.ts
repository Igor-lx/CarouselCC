/**
 * The MEDIA LIBRARY — individual, standalone media-condition hooks. Each is
 * usable on its own (grab exactly the one you need); within THIS folder they
 * all sit on the one `useMediaQuery` store — a single MediaQueryList listener
 * per distinct query, shared by every consumer of this copy.
 *
 * Dedup is per STORE COPY, not app-wide: each self-sufficient folder forks
 * its own `useMediaQuery` (copy-portability), so a query subscribed BOTH here
 * and via the `../useMedia` facade holds one listener in each copy. That is
 * rare (an app usually picks the library OR the facade for a given concern)
 * and harmless (two correct listeners, negligible overhead) — the accepted
 * price of every folder being liftable on its own.
 *
 * A general toolkit for any consumer — NOT shaped by any particular
 * component. The `../useMedia` facade mirrors these (by duplication — see
 * its internal/).
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
