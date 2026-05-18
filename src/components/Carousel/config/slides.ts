/**
 * Image-preload tuning for the slide layer.
 *
 * The carousel scrolls in *pages*: one step moves it by `visibleSlidesCount`
 * slides. Preload warms whole page-steps on each side of the visible band —
 * `lookahead` page-steps, i.e. `visibleSlidesCount * lookahead` images per
 * side.
 *
 * Lookahead is keyed by `visibleSlidesCount` so the *absolute* warmed buffer
 * stays bounded as the visible band widens: a wide band already fetches many
 * images per step, so deep lookahead would add bandwidth without much gain.
 *
 *   visibleSlidesCount | lookahead | warmed buffer (both sides)
 *   ------------------ | --------- | --------------------------
 *   1                  | 3         | 6 images
 *   2                  | 2         | 8 images
 *   3+                 | 1         | 2 * visibleSlidesCount images
 *
 * `PRELOAD_PAGE_LOOKAHEAD_DEFAULT` applies to any count not in the map.
 * Tune by editing the map — raising an entry trades bandwidth for more
 * burst-click runway, lowering it does the reverse.
 */
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
 * Image-retry policy. A slide image that fails to load is retried while the
 * slide sits in the active band, on an exponential backoff
 * (`BASE * 2^(failures - 1)`, clamped to `MAX`), and is given up after
 * `MAX_ATTEMPTS` failures.
 */
export const IMAGE_RETRY_BASE_DELAY_MS = 400;
export const IMAGE_RETRY_MAX_DELAY_MS = 8_000;
export const IMAGE_RETRY_MAX_ATTEMPTS = 5;
