export const PAGINATION_WIDGET_DEFAULTS = {
  visibleDots: 5,
  dotSize: 24,
  dotGap: 30,
  scaleFactor: 0.585,
} as const;

/** Tail-drift coefficient for off-screen edge dots. */
export const EDGE_DOT_DRIFT_FACTOR = 0.6;

/**
 * Per-frame change-detection thresholds for the dot DOM-write path. A new
 * projection value below the matching epsilon does not trigger a style
 * assignment (or even a transform-string allocation): the dot is already
 * visually at the previous value within sub-pixel / sub-percent precision,
 * and writing again only feeds the browser a redundant style invalidation.
 *
 * Tuned empirically — small enough that "wobble" between two near-equal
 * frames stays smooth, large enough that a steady-state idle widget emits
 * zero per-rAF DOM writes.
 */
export const DOT_POSITION_EPSILON_PX = 0.25;
export const DOT_SCALE_EPSILON = 0.002;
export const DOT_OPACITY_EPSILON = 0.01;
// The legacy-fallback frame-skip is NOT widget-local: one shared constant
// (`config/constants.ts` FALLBACK_WRITE_FRAME_SKIP) and one shared rule
// (`visual-position/fallbackPacing.ts`) pace the widget and the track together.
