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
 * Inverted frame-skip for the motion-bound dot writes: the binding follows the
 * live visual position every animation frame (so its speed matches the deck
 * exactly, including a finger drag and gesture strength), paints every frame,
 * and only DROPS each `WIDGET_WRITE_FRAME_SKIP`th one. This trades less
 * write-load saving than the old "paint every Nth frame" stride for a much
 * higher effective refresh rate — the previous stride=3 painted 1 of 3 frames
 * (~33%) and read as visible judder; skip=3 paints 2 of 3 (~67%) while still
 * shedding a third of the style-recalc load.
 *
 * The resting frame (settle / idle emit / drag-follow between segments) is
 * always painted regardless of the skip, so the dots never come to rest a
 * fraction of a frame early.
 *
 * Tuning: `2` drops every 2nd frame (paints 50% — equal load to the old
 * stride=2), `3` drops every 3rd (paints ~67%), `4` → 75%, `5` → 80%; higher
 * values paint more and save less. Values below `2` disable dropping entirely
 * (every frame painted).
 */
export const WIDGET_WRITE_FRAME_SKIP = 3;
