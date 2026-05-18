// Image-preload tuning for the slide layer.

export const PRELOAD_PAGE_LOOKAHEAD_BY_VISIBLE: Readonly<
  Record<number, number>
> = {
  1: 3,
  2: 2,
  3: 2,
};

/** Lookahead for any `visibleSlidesCount` absent from the map above. */
export const PRELOAD_PAGE_LOOKAHEAD_DEFAULT = 1;

/**
 * Heavy warm-up retention after a URL leaves the active preload window.
 *
 * `deck` keeps successful offscreen warm-up elements for every URL still in
 * the live deck, maximizing reuse for small finite decks.
 * `window` keeps only the current idle preload window, trading a little reuse
 * for tighter memory bounds on larger decks.
 */
export const IMAGE_WARMUP_RETENTION_MODES = ["deck", "window"] as const;
export type ImageWarmupRetentionMode =
  (typeof IMAGE_WARMUP_RETENTION_MODES)[number];
export const IMAGE_WARMUP_RETENTION_MODE: ImageWarmupRetentionMode = "deck";

/**
 * Image-retry policy. A slide image that fails to load is retried while the
 * slide sits in the active band, on an exponential backoff
 * (`BASE * 2^(failures - 1)`, clamped to `MAX`), and is given up after
 * `MAX_ATTEMPTS` failures.
 */
export const IMAGE_RETRY_BASE_DELAY_MS = 400;
export const IMAGE_RETRY_MAX_DELAY_MS = 8_000;
export const IMAGE_RETRY_MAX_ATTEMPTS = 5;
