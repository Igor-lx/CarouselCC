import type { CSSProperties } from "react";

import { SLIDE_REORIENT_VEIL } from "../config";
import { slideLane } from "../domain";

/**
 * THE JS→CSS custom-property contract. `CSSProperties` cannot express custom
 * properties, so each set of them is declared as an interface here — and
 * here ONLY, so "which variables does this component publish, in what units"
 * has a single address. The stylesheet consumes them; JS hands over DATA,
 * never rules (the rules live in `Carousel.module.scss`, so a host can
 * restyle through `className`).
 */

/** Root-level variables, one object for the whole component. */
export interface CarouselRootCssVars extends CSSProperties {
  /** Veil fade timings — bound to a JS invariant (the fail-open cap), hence
   * sourced from config rather than written in the stylesheet. */
  "--slide-reorient-fade-out": string;
  "--slide-reorient-fade-in": string;
  /** The live `visibleSlidesNr`; the slide/sizer width rule needs it and CSS
   * cannot know it on its own. */
  "--visible-slides": number;
}

/**
 * Per-slide variables. The lane is the ONE datum that cannot be shared —
 * each slide sits in a different one — so it is the only style built per
 * element.
 */
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
