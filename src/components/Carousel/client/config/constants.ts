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

/**
 * Legacy-fallback paint pacing. On engines with no Web Animations API the
 * per-frame JS path carries EVERY engine-driven motion (pre-WAAPI style), on
 * typically slow hardware — so every Nth running frame is dropped. ONE shared
 * constant for every consumer: the track and the pagination widget both
 * decide through `isDroppedFallbackFrame` on the same source-numbered frames,
 * so they always skip exactly the same frames and stay visually locked.
 *
 * Resting frames (settle, idle emits) and finger-drag frames are never
 * dropped. `4` paints 3 of 4 running frames; values below `2` disable
 * dropping. Never consulted on WAAPI-capable engines.
 */
export const FALLBACK_WRITE_FRAME_SKIP = 1;

/**
 * Fail-safe ceiling for the gesture coast bridge (lift-off → runner
 * takeover). The bridge normally ends the moment the ride segment starts or
 * the coast reaches the ride target; the cap only guards against a takeover
 * that never comes (a pathologically stalled commit).
 */
export const GESTURE_COAST_MAX_MS = 250;

/** Tolerance for "drag already on target" snap detection on release. */
export const DRAG_RELEASE_EPSILON = 0.001;
