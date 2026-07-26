// Hover / visibility / autoplay-pacing tuning.
// See docs/config/interaction.md for what each governs.

/** Delay before a desktop hover pauses autoplay (ms). */
export const HOVER_PAUSE_DELAY = 150;

/** Fraction of the viewport visible before autoplay resumes. */
export const VISIBILITY_THRESHOLD = 0.2;

/** Quiet window after the last viewport activity before an autoplay tick (ms). */
export const AUTOPLAY_RESETTLE_DELAY_MS = 300;

/** How far past the current destination a rapid repeated click lands (pages). */
export const REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES = 2;
