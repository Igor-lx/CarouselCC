// The JS→CSS custom-property contract, declared here only.
// See docs/architecture/presentation.md
import type { CSSProperties } from "react";

import { SLIDE_REORIENT_VEIL } from "../config";
import { slideLane } from "../domain";

/** Root-level variables, one object for the whole component. */
export interface CarouselRootCssVars extends CSSProperties {
  "--slide-reorient-fade-out": string;
  "--slide-reorient-fade-in": string;
  "--visible-slides": number;
}

/** Per-slide variables; the lane is the only per-element datum. */
export interface CarouselSlideCssVars extends CSSProperties {
  "--slide-lane": number;
}

/** Milliseconds → a CSS time token. */
const ms = (value: number): string => `${value}ms`;

export const buildRootCssVars = (
  visibleSlidesCount: number,
): CarouselRootCssVars => ({
  "--slide-reorient-fade-out": ms(SLIDE_REORIENT_VEIL.fadeOutMs),
  "--slide-reorient-fade-in": ms(SLIDE_REORIENT_VEIL.fadeInMs),
  "--visible-slides": visibleSlidesCount,
});

export const buildSlideCssVars = (
  virtualIndex: number,
  layoutOrigin: number,
): CarouselSlideCssVars => ({
  "--slide-lane": slideLane(virtualIndex, layoutOrigin),
});
