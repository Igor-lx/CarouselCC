export const PAGINATION_WIDGET_DEFAULTS = {
  visibleDots: 5,
  dotSize: 24,
  dotGap: 30,
  scaleFactor: 0.585,
} as const;

export const PAGINATION_WIDGET_LIMITS = {
  minVisibleDots: 3,
  maxVisibleDots: 101,
  minDotSize: 1,
  maxDotSize: 512,
  minDotGap: 0,
  maxDotGap: 512,
  minScaleFactor: 0.01,
  maxScaleFactor: 1,
} as const;

/** Tail-drift coefficient for off-screen edge dots. */
export const EDGE_DOT_DRIFT_FACTOR = 0.6;
