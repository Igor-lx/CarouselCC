import { useMemo } from "react";

import styles from "../Carousel.module.scss";
import { mergeStyleMaps } from "../../../../shared";
import type { VirtualSlide } from "../domain";
import type { ClassNameMap, SlideClassMap } from "../public-api/types";
import {
  buildRootCssVars,
  buildSlideCssVars,
  type CarouselRootCssVars,
  type CarouselSlideCssVars,
} from "./cssVars";
import { buildFlagAttributes, buildSlideClassMap } from "./domPayload";

interface UseCarouselPresentationInput {
  /** Host class overrides (the public `className` prop), merged over the
   * component's own module map. */
  className?: ClassNameMap;
  visibleSlidesCount: number;
  virtualSlides: VirtualSlide[];
  layoutOrigin: number;
  /** Active-state map of the viewport flags (from the media facade). */
  flags: Readonly<Record<string, boolean>>;
}

export interface CarouselPresentation {
  /** The merged class map — module classes with host overrides appended. */
  classNames: ClassNameMap;
  /** The slide-facing subset of the above. */
  slideClassMap: SlideClassMap;
  /** Root CSS custom properties: `style={rootStyle}`. */
  rootStyle: CarouselRootCssVars;
  /** One style object per slide, positionally aligned with `virtualSlides`. */
  slideStyles: CarouselSlideCssVars[];
  /** Active viewport flags as `data-<flag>="true"` attributes for the root. */
  flagAttributes: Record<string, string>;
}

/**
 * EVERYTHING the carousel hands to the DOM as presentation payload — classes,
 * CSS custom properties and state attributes — in one call, so the
 * composition root composes instead of assembling styles.
 *
 * Each field is memoised on its own inputs: `slideStyles` keeps stable object
 * identities so `SlideItem`'s memo is not defeated by a fresh literal every
 * render, and the flag attributes stay stable while the viewport does.
 */
export const useCarouselPresentation = ({
  className,
  visibleSlidesCount,
  virtualSlides,
  layoutOrigin,
  flags,
}: UseCarouselPresentationInput): CarouselPresentation => {
  const classNames = useMemo(
    () => (className ? mergeStyleMaps(styles, className) : styles),
    [className],
  );

  const slideClassMap = useMemo(
    () => buildSlideClassMap(classNames),
    [classNames],
  );

  const rootStyle = useMemo(
    () => buildRootCssVars(visibleSlidesCount),
    [visibleSlidesCount],
  );

  const slideStyles = useMemo(
    () =>
      virtualSlides.map((slide) =>
        buildSlideCssVars(slide.virtualIndex, layoutOrigin),
      ),
    [layoutOrigin, virtualSlides],
  );

  const flagAttributes = useMemo(() => buildFlagAttributes(flags), [flags]);

  return { classNames, slideClassMap, rootStyle, slideStyles, flagAttributes };
};
