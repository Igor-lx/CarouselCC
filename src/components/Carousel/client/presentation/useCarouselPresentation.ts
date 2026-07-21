import { useMemo, useRef } from "react";

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

  // Per-lane style objects are CACHED by virtual index, not just memoised as
  // an array. `virtualSlides` is rebuilt whenever `isMoving` flips (the
  // visibility flags depend on it), i.e. at the start AND the end of every
  // ride — but a slide's lane depends only on its own virtualIndex and the
  // layout origin, neither of which moved. Rebuilding the style objects there
  // would hand every mounted SlideItem a fresh `style` prop and break its
  // memo, re-rendering the whole deck twice per ride, in exactly the two
  // frames where the animation starts and settles. Reusing the object keeps
  // the prop `===`, so only slides whose OWN flags changed re-render.
  const laneCacheRef = useRef({
    origin: Number.NaN,
    byIndex: new Map<number, CarouselSlideCssVars>(),
  });

  const slideStyles = useMemo(() => {
    const cache = laneCacheRef.current;
    if (cache.origin !== layoutOrigin) {
      // A recenter re-bases every lane: drop the whole cache.
      cache.origin = layoutOrigin;
      cache.byIndex.clear();
    } else {
      // Keep the map bounded by the render window.
      const live = new Set(virtualSlides.map((slide) => slide.virtualIndex));
      for (const index of cache.byIndex.keys()) {
        if (!live.has(index)) cache.byIndex.delete(index);
      }
    }

    return virtualSlides.map((slide) => {
      const cached = cache.byIndex.get(slide.virtualIndex);
      if (cached) return cached;
      const style = buildSlideCssVars(slide.virtualIndex, layoutOrigin);
      cache.byIndex.set(slide.virtualIndex, style);
      return style;
    });
  }, [layoutOrigin, virtualSlides]);

  const flagAttributes = useMemo(() => buildFlagAttributes(flags), [flags]);

  return { classNames, slideClassMap, rootStyle, slideStyles, flagAttributes };
};
