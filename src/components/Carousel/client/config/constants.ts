/**
 * THE CONTRACT OF `config/`: everything in this folder is a TUNABLE — a
 * feel, product or performance knob a developer may change freely to taste,
 * with every value guarded by the Diagnostic layer. Implementation constants
 * (tolerances, sanity clamps, calibration records, private thresholds) do
 * NOT live here — they live WITH the code they serve, documented in place
 * (e.g. `MOTION_EPSILON` in motion/, `DRAG_RELEASE_EPSILON` in
 * domain/dragRelease.ts, `GESTURE_COAST_MAX_MS` in gesture/coast.ts,
 * `SWIPE_REFERENCE_SLOT_PX` in gesture/slotAdaptiveSwipe.ts). If changing a
 * value requires understanding the algorithm around it, it does not belong
 * in this folder.
 */

/**
 * Render-window buffer in page screens (>= 1). Larger values keep more
 * neighbouring slides mounted around the visible band.
 *
 * `2` is deliberate: it pre-mounts, while the deck is idle, every slide a
 * single click (+1 page) or a repeated click (+REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES
 * pages) can reveal, so starting a motion never mounts new slides into the
 * moving track layer. A click-time mount forces commit + raster of the track
 * exactly when the motion begins — on mobile that pause is a visible hitch at
 * motion start. With `2` the mount/raster cost moves to the idle settle,
 * where it is invisible. The cost is a wider idle DOM (one extra page of
 * slides on each side). Must be >= the repeated-click lookahead (diagnosed).
 */
export const RENDER_WINDOW_BUFFER_MULTIPLIER = 2;

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
export const FALLBACK_WRITE_FRAME_SKIP = 4;
