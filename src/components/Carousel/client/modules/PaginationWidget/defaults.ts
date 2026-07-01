export const PAGINATION_WIDGET_DEFAULTS = {
  visibleDots: 5,
  dotSize: 24,
  dotGap: 30,
  scaleFactor: 0.585,
} as const;

/** Tail-drift coefficient for off-screen edge dots. */
export const EDGE_DOT_DRIFT_FACTOR = 0.6;

/**
 * The widget is a decoupled *step indicator*: every navigation — a single click,
 * a repeated click, a gesture release, or a many-page jump — advances it by
 * exactly ONE dot in the travel direction, on its OWN short, consistent timing.
 * It never mirrors the deck's motion profile (which can be a 4 s eased slide, an
 * inertial release, or a teleport), so its feel stays crisp and identical across
 * every navigation type.
 */
export const WIDGET_STEP_DURATION_MS = 460;

/** The widget's own easing (independent of the deck's `MOVE_BEZIER`). */
export const WIDGET_STEP_EASING = "cubic-bezier(0.33, 0.0, 0.2, 1)";

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
