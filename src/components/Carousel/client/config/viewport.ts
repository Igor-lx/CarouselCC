import { canonicalMediaQueries, type MediaAxes } from "../../../../shared";

// The carousel's viewport axes — the single source of its breakpoint
// names/numbers and flag conditions.
// See docs/config/viewport.md and
// docs/architecture/viewport.md.

export const SLIDE_VIEWPORT_BREAKPOINTS = {
  desktop: 1024,
  tablet: 768,
  mobile: 0,
} as const;

export type SlideViewportBreakpoint = keyof typeof SLIDE_VIEWPORT_BREAKPOINTS;

export const SLIDE_VIEWPORT_BASE_BREAKPOINT: SlideViewportBreakpoint =
  "desktop";

export const SLIDE_VIEWPORT_FLAGS = {
  "short-landscape": "(orientation: landscape) and (max-height: 520px)",
} as const;

export type SlideViewportFlag = keyof typeof SLIDE_VIEWPORT_FLAGS;

export const SLIDE_VIEWPORT_AXES: MediaAxes = {
  breakpoints: SLIDE_VIEWPORT_BREAKPOINTS,
  flags: SLIDE_VIEWPORT_FLAGS,
};

export const SLIDE_CANONICAL_SOURCE_MEDIA: readonly string[] =
  canonicalMediaQueries(SLIDE_VIEWPORT_AXES);
