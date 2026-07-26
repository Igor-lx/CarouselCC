// Slide-layer image tuning. See docs/config/slides.md for what each governs.

/** Orientation-swap veil fade-out (ms). */
export const SLIDE_REORIENT_FADE_OUT_MS = 650;
/** Orientation-swap veil fade-in; also times the slow-load reveal (ms). */
export const SLIDE_REORIENT_FADE_IN_MS = 550;
/** Fail-open cap on the reorientation veil (ms). */
export const SLIDE_REORIENT_VEIL_MAX_MS = 2250;

/** First image-retry backoff delay (ms). */
export const IMAGE_RETRY_BASE_DELAY_MS = 400;
/** Image-retry backoff ceiling (ms). */
export const IMAGE_RETRY_MAX_DELAY_MS = 8000;
/** Image-retry attempts before the slide gives up. */
export const IMAGE_RETRY_MAX_ATTEMPTS = 5;
