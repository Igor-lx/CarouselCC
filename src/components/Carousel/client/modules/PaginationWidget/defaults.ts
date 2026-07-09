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

/**
 * Frame-skip for the per-frame FALLBACK engine only — legacy browsers without
 * CSS `linear()` easing support, where every motion (not just a finger drag)
 * is painted frame by frame like the pre-WAAPI system. Dropping each Nth dot
 * write sheds a share of the style-recalc load exactly where the per-frame
 * path is hottest and the devices are typically slowest. The resting frame is
 * always painted, so the dots never stop a fraction of a frame early.
 *
 * `3` drops every 3rd frame (paints ~67%); values below `2` disable dropping.
 * On modern engines this constant is never consulted: planned motion runs on
 * WAAPI with zero per-frame writes, and the only per-frame path left — the
 * finger-drag follow — always paints at full rate.
 */
export const FALLBACK_WRITE_FRAME_SKIP = 3;
