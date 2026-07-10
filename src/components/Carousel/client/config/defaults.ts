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
  jumpSpeedMultiplier: 8,
  errAltPlaceholder: "Downloading Error",
  isPagePaddingOn: false,
  isContentImg: true,
  isAuto: true,
  isPaginationOn: true,
  isControlsOn: true,
  isSwipeOn: true,
  isInteractive: true,
  isFinite: false,
} as const;
