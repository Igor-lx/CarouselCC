/** Delay before hover-induced pause triggers, in milliseconds. */
export const HOVER_PAUSE_DELAY = 150;

/** Fraction of the viewport that must be visible before autoplay resumes. */
export const VISIBILITY_THRESHOLD = 0.2;

/**
 * Quiet window after the last glass/viewport activity (a finger anywhere on
 * screen, page scroll frames incl. the fling, browser-chrome resizes) before
 * an autoplay tick may fire, in milliseconds.
 *
 * WHY: when the mobile browser toolbar settles after a scroll, the system
 * display compositor aggregates two live surfaces and, on weak GPUs, the
 * page's frames miss the presentation latch for 2-3 vsyncs — anything moving
 * right then visibly bounces (PERF-INVESTIGATION §9.3; measured 33-50ms
 * present gaps at every scroll stop). A page cannot see or prevent that
 * stall; it CAN avoid STARTING avoidable motion inside the window. The
 * window self-extends on every observed signal, so this value only needs to
 * cover the silent tail after the LAST signal — not whole flings or settles.
 */
export const AUTOPLAY_RESETTLE_DELAY_MS = 600;
