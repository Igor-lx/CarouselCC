// Image tuning for the slide layer.

/**
 * Image-retry policy. A slide image that fails to load is retried while the
 * slide sits in the active band, on an exponential backoff
 * (`BASE * 2^(failures - 1)`, clamped to `MAX`), and is given up after
 * `MAX_ATTEMPTS` failures.
 */
/**
 * THE art-direction flip of the slide-geometry contract: viewports matching
 * this condition show the WIDE (16:9) crop; everything else — desktops,
 * laptops, tablets, portrait phones — shows the TALL (9:16) default. Only a
 * compact landscape viewport (a handheld held sideways) is physically too
 * short for a tall slide, so that is the one place the wide crop applies.
 * The value deliberately matches the shared `COMPACT_LANDSCAPE_QUERY`
 * ergonomics condition so the crop and the host layout flip together.
 *
 * The same string lives in three places that must stay in lockstep (guarded
 * by `orientationMediaSync.test.ts`):
 *  - `Carousel.module.scss` — flips `--slide-aspect` (box geometry);
 *  - the generated `<source media>` of every art-directed slide (asset);
 *  - this constant — the JS mirror driving the reorientation veil and the
 *    warm-candidate choice, so both react to EXACTLY the flip that swaps
 *    box and asset.
 */
export const SLIDE_WIDE_MEDIA_CONDITION =
  "(orientation: landscape) and (max-height: 520px)";

/**
 * Orientation-swap veil timing (one layer, three knobs — diagnostics audit
 * the set). Fade-out and fade-in are SEPARATE on purpose — this is not
 * tuning for its own sake, the two directions genuinely read differently:
 * the fade-out starts mid-rotation (the OS flips the orientation condition
 * around 45–60° of physical tilt, so part of the dimming hides inside the
 * system rotation animation), its frames are dropped by the rotation
 * relayout, and the eye registers disappearance as an instant event while
 * appearance reads as a process. With equal durations the fade-out FEELS
 * much shorter — so it gets extra time to stay perceptible, while the
 * fade-in runs on a calm, settled screen and needs less. Injected into CSS
 * by the root as `--slide-reorient-fade-out` / `--slide-reorient-fade-in`.
 *
 * The cap is the fail-open ceiling — past it, showing the OLD crop (zoomed
 * centre) beats hiding the image, so the veil lifts and the swap finishes
 * in the open. It must cover a full fade out PLUS fade in.
 */
export const SLIDE_REORIENT_FADE_OUT_MS = 650;
/**
 * Also times the SLOW-LOAD reveal (data-awaiting-image): a still-loading
 * image is held invisible and the complete bitmap fades in over this same
 * duration — the two are the same perceptual act (an image appearing on a
 * calm, settled screen), so they deliberately share one knob.
 */
export const SLIDE_REORIENT_FADE_IN_MS = 550;
export const SLIDE_REORIENT_VEIL_MAX_MS = 2250;

export const IMAGE_RETRY_BASE_DELAY_MS = 400;
export const IMAGE_RETRY_MAX_DELAY_MS = 8000;
export const IMAGE_RETRY_MAX_ATTEMPTS = 5;
