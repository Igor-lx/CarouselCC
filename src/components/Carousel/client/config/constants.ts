/**
 * Render-window buffer in page screens (>= 1). Larger values keep more
 * neighbouring slides mounted around the visible band.
 *
 * `2` is deliberate: it pre-mounts, while the deck is idle, every slide a
 * single click (+1 page) or a repeated click (+2 pages — the visual-lookahead
 * cap) can reveal, so starting a motion never mounts new slides into the
 * moving track layer. A click-time mount forces commit + raster of the track
 * exactly when the motion begins — on mobile that pause is a visible hitch at
 * motion start. With `2` the mount/raster cost moves to the idle settle,
 * where it is invisible. The cost is a wider idle DOM (one extra page of
 * slides on each side).
 */
export const RENDER_WINDOW_BUFFER_MULTIPLIER = 2;

/** Tolerance for motion sample position/velocity comparisons. */
export const MOTION_EPSILON = 0.0001;

/** Tolerance for "drag already on target" snap detection on release. */
export const DRAG_RELEASE_EPSILON = 0.001;
