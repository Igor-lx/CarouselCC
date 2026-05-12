/**
 * Render-window buffer in slide steps (>= 1). Larger values keep more
 * neighbouring slides mounted around the visible band.
 */
export const RENDER_WINDOW_BUFFER_MULTIPLIER = 1;

/** Tolerance for comparing repeated-click positions. */
export const REPEATED_CLICK_EPSILON = 0.0001;

/** Tolerance for motion sample position/velocity comparisons. */
export const MOTION_EPSILON = 0.0001;

/** Tolerance for "drag already on target" snap detection on release. */
export const DRAG_RELEASE_EPSILON = 0.001;
