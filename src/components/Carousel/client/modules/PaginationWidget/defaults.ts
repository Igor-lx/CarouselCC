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
 * Frame stride for the motion-bound dot writes: the binding follows the live
 * visual position every animation frame (so its speed matches the deck exactly,
 * including a finger drag and gesture strength), but only commits the projected
 * dot styles to the DOM every Nth frame. This cuts the per-step style-recalc
 * load ~N× while keeping the motion 1:1 with the carousel — the widget still
 * samples the true position, it just paints it slightly less often.
 *
 * The final settle frame is always painted regardless of stride, so the dots
 * never come to rest a fraction of a frame early. `1` writes every frame (the
 * original behaviour); `2`–`3` is visually indistinguishable at 60–120 Hz while
 * roughly halving / thirding the write load.
 */
export const WIDGET_WRITE_FRAME_STRIDE = 3;
