export const PAGINATION_WIDGET_DEFAULTS = {
  visibleDots: 5,
  dotSize: 24,
  dotGap: 30,
  scaleFactor: 0.585,
} as const;

/** Tail-drift coefficient for off-screen edge dots. */
export const EDGE_DOT_DRIFT_FACTOR = 0.6;

/**
 * Opacity of the edge slot at REST (the outermost visible dot). Previously
 * implicit in the fade-band arithmetic; named because it is the one product
 * look the opacity field pivots on. The two ramp widths around it are NOT
 * knobs: the inner half-step is the distance from "fully inside" to the edge
 * slot, and the outer width is exactly ONE step because an edge handover
 * takes exactly one step — widening or narrowing either would break the
 * resting look or the leaving/arriving mirror symmetry (see dotOpacityAt).
 */
export const EDGE_DOT_RESTING_OPACITY = 0.5;

// The legacy-fallback frame-skip is NOT widget-local: one shared constant
// (`config/legacyPaint.ts` FALLBACK_DROP_EVERY_NTH_FRAME) and one shared rule
// (`visual-position/fallbackPacing.ts`) pace the widget and the track together.
