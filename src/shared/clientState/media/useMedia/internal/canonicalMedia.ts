import {
  breakpointMinWidthQuery,
  sortedBreakpointEntries,
  type BreakpointTable,
} from "./resolveActiveBreakpoint";
import {
  LANDSCAPE_ORIENTATION_QUERY,
  PORTRAIT_ORIENTATION_QUERY,
} from "./useOrientation";

// See ../README.md
/** Named width tiers + arbitrary named flag conditions; orientation is implicit. */
export interface MediaAxes {
  breakpoints: BreakpointTable;
  /** name -> media condition string. The name becomes the flag key. */
  flags?: Readonly<Record<string, string>>;
}

// The facade's subscription set AND the canonical `<source media>` set (one
// derivation, so nothing can key off a condition the facade doesn't track).
export const canonicalMediaQueries = (axes: MediaAxes): string[] => [
  ...sortedBreakpointEntries(axes.breakpoints)
    .filter(([, px]) => px > 0)
    .map(([, px]) => breakpointMinWidthQuery(px)),
  PORTRAIT_ORIENTATION_QUERY,
  LANDSCAPE_ORIENTATION_QUERY,
  ...Object.values(axes.flags ?? {}),
];
