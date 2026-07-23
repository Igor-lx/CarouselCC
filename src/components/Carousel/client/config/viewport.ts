import { canonicalMediaQueries, type MediaAxes } from "../../../../shared";

/**
 * THE viewport axes of the carousel — the single place where its breakpoint
 * NAMES/NUMBERS and its flag conditions are defined. Everything else derives
 * from here:
 *
 *  - the root resolves these axes (one `useMedia` call) and stamps the
 *    result as data attributes (`data-breakpoint`, `data-orientation`, and
 *    `data-<flag>` for each flag); the component SCSS styles slide geometry
 *    by those attributes — the stylesheet holds NO media queries and NO
 *    numbers;
 *  - art-directed slide data (`<source media>`) uses the CANONICAL strings
 *    below (derived from the same axes) — so the box, the asset choice, the
 *    warm and the veil all flip on the same thresholds;
 *  - Diagnostics audits every leg against these axes at runtime.
 *
 * All of it is TUNING owned by the carousel (self-sufficient — nothing here
 * comes from the host App). Names are yours: breakpoints resolve purely by
 * NUMBER (largest matching threshold wins), so naming/order can never shadow
 * a wider tier; `0` is the fallback tier. Flags are arbitrary named media
 * conditions (height, aspect-ratio, …) written LITERALLY here — the
 * `short-landscape` value is a plain string, deliberately NOT imported from
 * the shared `useShortLandscape` primitive, so this component owns it. The
 * only rule: keep the `<source media>` strings in your data equal to the
 * canonical strings (the sync test and Diagnostics both check).
 */
export const SLIDE_VIEWPORT_BREAKPOINTS = {
  desktop: 1024,
  tablet: 768,
  mobile: 0,
} as const;

export type SlideViewportBreakpoint = keyof typeof SLIDE_VIEWPORT_BREAKPOINTS;

/**
 * The BASE tier — the one whose geometry lives in the plain `.outerContainer`
 * rule, not in a `[data-breakpoint="…"]` block. The stylesheet is written
 * desktop-first, so its default values ARE the desktop tier and only the
 * narrower tiers override.
 *
 * This is a STYLING fact, not a resolution one, and it cannot be derived from
 * the table: the resolver's fallback is the NARROWEST tier (`0`), while the
 * CSS base is the WIDEST — opposite ends. A mobile-first stylesheet would name
 * `mobile` here instead. Diagnostics reads it to know that this tier styling
 * "nothing by attribute" is intended (it is the base), not a forgotten block.
 */
export const SLIDE_VIEWPORT_BASE_BREAKPOINT: SlideViewportBreakpoint = "desktop";

/**
 * Arbitrary named boolean viewport conditions → `data-<name>` on the root.
 * The current demo declares one — `short-landscape` (a landscape viewport
 * too short in HEIGHT for a tall slide, a handheld held sideways). Add,
 * rename or remove freely; each becomes a stylable state.
 */
export const SLIDE_VIEWPORT_FLAGS = {
  "short-landscape": "(orientation: landscape) and (max-height: 520px)",
} as const;

export type SlideViewportFlag = keyof typeof SLIDE_VIEWPORT_FLAGS;

/** The axes as one object — the config passed to `useMedia`. */
export const SLIDE_VIEWPORT_AXES: MediaAxes = {
  breakpoints: SLIDE_VIEWPORT_BREAKPOINTS,
  flags: SLIDE_VIEWPORT_FLAGS,
};

/**
 * Every media string the carousel recognises as an art-direction condition
 * for `<source media>` in slide data — the width tiers (px>0), both
 * orientations and every flag, all derived from the axes above. Slide data
 * may use ANY subset; Diagnostics warns about strings outside this list
 * (they still work in the browser, but nothing guarantees they flip with the
 * box).
 */
export const SLIDE_CANONICAL_SOURCE_MEDIA: readonly string[] =
  canonicalMediaQueries(SLIDE_VIEWPORT_AXES);
