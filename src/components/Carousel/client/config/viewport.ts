import { canonicalMediaQueries, type MediaAxes } from "../../../../shared";

// The carousel's viewport axes — the single source of its breakpoint
// names/numbers and flag conditions. See docs/config/viewport.md and
// docs/architecture/viewport.md.

/** Width tiers as `name: minWidthPx` (largest matching threshold wins; a
 * zero-width tier is the always-matching fallback). */
export const SLIDE_VIEWPORT_BREAKPOINTS = {
  desktop: 1024,
  tablet: 768,
  mobile: 0,
} as const;

export type SlideViewportBreakpoint = keyof typeof SLIDE_VIEWPORT_BREAKPOINTS;

/** The base tier, styled by the plain rule (not a `[data-breakpoint]` block). */
export const SLIDE_VIEWPORT_BASE_BREAKPOINT: SlideViewportBreakpoint = "desktop";

/** Named boolean viewport conditions → `data-<name>` on the root. */
export const SLIDE_VIEWPORT_FLAGS = {
  "short-landscape": "(orientation: landscape) and (max-height: 520px)",
} as const;

export type SlideViewportFlag = keyof typeof SLIDE_VIEWPORT_FLAGS;

/** The axes as one object (passed to `useMedia`). */
export const SLIDE_VIEWPORT_AXES: MediaAxes = {
  breakpoints: SLIDE_VIEWPORT_BREAKPOINTS,
  flags: SLIDE_VIEWPORT_FLAGS,
};

/** Every media string recognised for `<source media>`, derived from the axes. */
export const SLIDE_CANONICAL_SOURCE_MEDIA: readonly string[] =
  canonicalMediaQueries(SLIDE_VIEWPORT_AXES);
