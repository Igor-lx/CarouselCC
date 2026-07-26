// See docs/architecture/modules.md
export const PAGINATION_WIDGET_DEFAULTS = {
  visibleDots: 5,
  dotSize: 24,
  dotGap: 30,
  scaleFactor: 0.585,
} as const;

/** Tail-drift coefficient for off-screen edge dots. */
export const EDGE_DOT_DRIFT_FACTOR = 0.6;

/** Resting opacity of the edge slot; the ramp widths around it are not knobs (see dotOpacityAt). */
export const EDGE_DOT_RESTING_OPACITY = 0.5;
