import { canonicalMediaQueries, type MediaAxes } from "../../../../shared";

/**
 * THE viewport axes of the carousel — the single source of its breakpoint
 * names/numbers and flag conditions; the root stamps them as data attributes
 * and the SCSS keys on those (no media queries, no numbers in CSS). All
 * carousel-owned tuning. See docs/architecture/viewport.md.
 *
 * Breakpoints resolve purely by NUMBER (largest matching threshold wins), so
 * naming/order cannot shadow a tier; `0` is the fallback.
 */
export const SLIDE_VIEWPORT_BREAKPOINTS = {
  desktop: 1024,
  tablet: 768,
  mobile: 0,
} as const;

export type SlideViewportBreakpoint = keyof typeof SLIDE_VIEWPORT_BREAKPOINTS;

/**
 * The BASE tier — styled by the plain `.outerContainer` rule, not a
 * `[data-breakpoint]` block. A STYLING fact, not derivable from the table: the
 * desktop-first stylesheet's base is the WIDEST tier, while the resolver's
 * fallback is the NARROWEST (`0`). Mobile-first CSS would name `mobile` here.
 */
export const SLIDE_VIEWPORT_BASE_BREAKPOINT: SlideViewportBreakpoint = "desktop";

/** Arbitrary named boolean viewport conditions → `data-<name>` on the root. */
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
 * Every media string the carousel recognises for `<source media>` in slide
 * data, derived from the axes above. Slide data should use these (Diagnostics
 * warns about strings outside the list). See docs/architecture/viewport.md.
 */
export const SLIDE_CANONICAL_SOURCE_MEDIA: readonly string[] =
  canonicalMediaQueries(SLIDE_VIEWPORT_AXES);
