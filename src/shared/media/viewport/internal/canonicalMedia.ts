import {
  breakpointMinWidthQuery,
  sortedBreakpointEntries,
  type BreakpointTable,
} from "../../library/resolveActiveBreakpoint";
import {
  LANDSCAPE_ORIENTATION_QUERY,
  PORTRAIT_ORIENTATION_QUERY,
} from "../../library/useOrientation";

/**
 * The set of viewport axes a consumer cares about: named width tiers plus
 * arbitrary named boolean flags (any media condition — height, aspect-ratio,
 * hover, …). Orientation is always available and needs no declaration.
 */
export interface ViewportAxes {
  breakpoints: BreakpointTable;
  /** name -> media condition string. The name becomes the flag key. */
  flags?: Readonly<Record<string, string>>;
}

/**
 * Every media string these axes subscribe to and recognise: the width tiers
 * (px > 0 only — the `0` fallback always matches and would be meaningless as
 * a `<source media>`), BOTH orientations, and every flag condition. This is
 * simultaneously the facade's live-subscription set AND the canonical set an
 * art-directed `<source media>` may use — one derivation, so box, asset,
 * warm and veil can never key off a condition the facade does not track.
 */
export const viewportCanonicalMedia = (axes: ViewportAxes): string[] => [
  ...sortedBreakpointEntries(axes.breakpoints)
    .filter(([, px]) => px > 0)
    .map(([, px]) => breakpointMinWidthQuery(px)),
  PORTRAIT_ORIENTATION_QUERY,
  LANDSCAPE_ORIENTATION_QUERY,
  ...Object.values(axes.flags ?? {}),
];
