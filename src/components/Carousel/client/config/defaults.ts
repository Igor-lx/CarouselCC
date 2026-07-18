/**
 * Default values for public props. Sourced from the product contract.
 * These are the "out of the box" values that the demo would render with if
 * no override is provided.
 */
export const CAROUSEL_DEFAULTS = {
  visibleSlidesNr: 3,
  durationAutoplay: 3000,
  intervalAutoplay: 3000,
  durationStep: 2000,
  errAltPlaceholder: "Downloading Error",
  isFullPagesOn: false,
  isContentImg: true,
  isAutoplayOn: true,
  isPaginationOn: true,
  isControlsOn: true,
  isSwipeOn: true,
  isSlideInteractiveOn: true,
  isPaginationInteractiveOn: true,
  isFinite: false,
} as const;
