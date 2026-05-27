export const PAGINATION_WIDGET_DEFAULTS = {
  visibleDots: 5,
  dotSize: 24,
  dotGap: 30,
  scaleFactor: 0.585,
} as const;

/** Tail-drift coefficient for off-screen edge dots. */
export const EDGE_DOT_DRIFT_FACTOR = 0.6;

/**
 * Per-frame change-detection thresholds for the widget DOM-write path. Values
 * below these epsilons are visually indistinguishable but still force style
 * invalidation if written every rAF tick.
 */
export const DOT_POSITION_EPSILON_PX = 0.325;
export const DOT_SCALE_EPSILON = 0.0026;
export const DOT_OPACITY_EPSILON = 0.013;
