export const DECK_CLASS_KEYS = [
  "outerContainer",
  "innerContainer",
  "slideContainer",
] as const;

export const SLIDE_CLASS_KEYS = [
  "slide",
  "slideInteractive",
  "slideError",
  "slideText",
] as const;

export const CLASS_NAME_KEYS = [
  ...DECK_CLASS_KEYS,
  ...SLIDE_CLASS_KEYS,
] as const;
