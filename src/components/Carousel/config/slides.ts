// Image tuning for the slide layer.

/**
 * How many page screens on each side of the visible band the idle predecode
 * warms (fetch + async decode of off-band neighbour slides). Kept small: it
 * only needs to cover the next/previous page a single step can reveal, so the
 * retained offscreen-image set stays bounded regardless of deck size.
 */
export const PRELOAD_NEIGHBOR_PAGE_SPAN = 2;

/**
 * Image-retry policy. A slide image that fails to load is retried while the
 * slide sits in the active band, on an exponential backoff
 * (`BASE * 2^(failures - 1)`, clamped to `MAX`), and is given up after
 * `MAX_ATTEMPTS` failures.
 */
export const IMAGE_RETRY_BASE_DELAY_MS = 400;
export const IMAGE_RETRY_MAX_DELAY_MS = 8_000;
export const IMAGE_RETRY_MAX_ATTEMPTS = 5;
