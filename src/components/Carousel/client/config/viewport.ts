import {
  COMPACT_LANDSCAPE_QUERY,
  LANDSCAPE_ORIENTATION_QUERY,
  PORTRAIT_ORIENTATION_QUERY,
  breakpointMinWidthQuery,
  sortedBreakpointEntries,
} from "../../../../shared";

/**
 * THE viewport axes of the carousel — the single place where its breakpoint
 * NAMES and NUMBERS are defined. Everything else derives from here:
 *
 *  - the root stamps the resolved names as data attributes
 *    (`data-breakpoint`, `data-orientation`, `data-compact-landscape`), and
 *    the component SCSS styles slide geometry by those attributes — the
 *    stylesheet contains NO media queries and NO numbers;
 *  - art-directed slide data (`<source media>`) uses the CANONICAL media
 *    strings below, generated from the same numbers — so the box, the asset
 *    choice, the warm and the veil all flip on the same thresholds;
 *  - Diagnostics audits all legs against this table at runtime.
 *
 * Names are YOURS: the resolver ranks tiers by their NUMBERS (largest
 * matching threshold wins), so naming and declaration order can never
 * shadow a wider tier. `0` is the fallback tier. Rename/retune freely —
 * the only rule is to keep the `<source media>` strings in your data equal
 * to the canonical strings below (the sync test and Diagnostics both check).
 */
export const SLIDE_VIEWPORT_BREAKPOINTS = {
  desktop: 1024,
  tablet: 768,
  mobile: 0,
} as const;

export type SlideViewportBreakpoint = keyof typeof SLIDE_VIEWPORT_BREAKPOINTS;

/**
 * Every media string the carousel recognises as an art-direction condition
 * for `<source media>` in slide data: the tier thresholds (canonical
 * `min-width` form, fallback tier excluded — a 0-width condition would
 * always match and shadow the default set), both orientations, and the
 * shared compact-landscape ergonomics condition. Slide data may use ANY
 * subset; Diagnostics warns about strings outside this list (they still
 * work in the browser, but nothing guarantees they flip with the box).
 */
export const SLIDE_CANONICAL_SOURCE_MEDIA: readonly string[] = [
  ...sortedBreakpointEntries(SLIDE_VIEWPORT_BREAKPOINTS)
    .filter(([, px]) => px > 0)
    .map(([, px]) => breakpointMinWidthQuery(px)),
  PORTRAIT_ORIENTATION_QUERY,
  LANDSCAPE_ORIENTATION_QUERY,
  COMPACT_LANDSCAPE_QUERY,
];
