/**
 * Single source of truth for the class-name keys the carousel and its slides
 * accept through `className`. Kept zero-runtime (just two `as const` arrays)
 * so it can be imported from any layer — including the runtime hot path —
 * without dragging in Zod.
 */

export const CLASS_NAME_KEYS = [
  "outerContainer",
  "innerContainer",
  "slideContainer",
  "slide",
  "slideInteractive",
  "slideError",
  "slideText",
] as const;

export const SLIDE_CLASS_KEYS = [
  "slide",
  "slideInteractive",
  "slideError",
  "slideText",
] as const;
