// Image tuning for the slide layer.

/**
 * Image-retry policy. A slide image that fails to load is retried while the
 * slide sits in the active band, on an exponential backoff
 * (`BASE * 2^(failures - 1)`, clamped to `MAX`), and is given up after
 * `MAX_ATTEMPTS` failures.
 */
/**
 * THE orientation condition of the slide-geometry contract. The same string
 * lives in three places that must stay in lockstep (guarded by
 * `orientationMediaSync.test.ts`):
 *  - `Carousel.module.scss` — flips `--slide-aspect` (box geometry);
 *  - the generated `<source media>` of every art-directed slide (asset);
 *  - this constant — the JS mirror driving the orientation-swap veil, so the
 *    veil reacts to EXACTLY the flip that swaps box and asset.
 */
export const SLIDE_PORTRAIT_MEDIA_CONDITION = "(orientation: portrait)";

/**
 * Orientation-swap veil timing (one layer, two knobs — diagnostics audit the
 * pair): the fade is how fast the bitmap dims/reappears (injected into CSS as
 * `--slide-reorient-fade` by the root), the cap is the fail-open ceiling —
 * past it, showing the OLD crop (zoomed centre) beats hiding the image, so
 * the veil lifts and the swap finishes in the open. The cap must leave room
 * for a full fade out AND back in.
 */
export const SLIDE_REORIENT_FADE_MS = 350;
export const SLIDE_REORIENT_VEIL_MAX_MS = 2_000;

export const IMAGE_RETRY_BASE_DELAY_MS = 400;
export const IMAGE_RETRY_MAX_DELAY_MS = 8_000;
export const IMAGE_RETRY_MAX_ATTEMPTS = 5;
