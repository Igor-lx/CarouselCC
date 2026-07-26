// Default values substituted for undefined public props (out-of-the-box demo
// settings). See docs/config/defaults.md; the props themselves are documented
// in docs/architecture/public-api.md.
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
