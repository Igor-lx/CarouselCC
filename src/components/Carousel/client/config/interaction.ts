/** Delay before hover-induced pause triggers, in milliseconds. */
export const HOVER_PAUSE_DELAY = 150;

/** Fraction of the viewport that must be visible before autoplay resumes. */
export const VISIBILITY_THRESHOLD = 0.2;

/**
 * Quiet window after the last glass/viewport activity (a finger anywhere on
 * screen, page scroll frames incl. the fling, browser-chrome resizes) before
 * an autoplay tick may fire, in milliseconds.
 *
 * WHY: after a mobile toolbar settle the compositor misses the presentation
 * latch for a few vsyncs on weak GPUs, so motion STARTED in that window
 * visibly bounces. The page cannot prevent the stall, only avoid starting
 * avoidable motion inside it. The window self-extends on every observed
 * signal, so this value covers only the silent tail after the LAST one.
 */
export const AUTOPLAY_RESETTLE_DELAY_MS = 300;

/**
 * How far ahead of the deck's CURRENT destination a rapid repeated click
 * lands, in pages. `2` means each click during motion resolves to "one page
 * past the page the deck is already heading to" — clicks pick each other up
 * and the deck keeps moving continuously while the spam holds, then settles
 * one page after the burst ends. A product-behaviour knob; must not exceed
 * RENDER_WINDOW_BUFFER_MULTIPLIER (diagnosed), or a repeated click would
 * mount slides into the moving track layer.
 */
export const REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES = 2;
