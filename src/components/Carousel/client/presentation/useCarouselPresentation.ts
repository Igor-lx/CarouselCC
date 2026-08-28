// See docs/architecture/presentation.md
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
  className?: ClassNameMap | undefined;
  visibleSlidesCount: number;
  virtualSlides: VirtualSlide[];
  layoutOrigin: number;
  flags: Readonly<Record<string, boolean>>;
}

export interface CarouselPresentation {
  classNames: ClassNameMap;
  slideClassMap: SlideClassMap;
  rootStyle: CarouselRootCssVars;
  /** The lane style of one virtual index. A getter rather than a parallel
   * array: positional alignment with `virtualSlides` was an invariant only a
   * comment could state, and the caller had to index into it. */
  slideStyleFor: (virtualIndex: number) => CarouselSlideCssVars;
  flagAttributes: Record<string, string>;
}

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

  // Per-lane styles CACHED by virtual index to keep SlideItem's `style` prop
  // `===` across the twice-per-ride virtualSlides rebuild — see the doc.
  const laneCacheRef = useRef({
    origin: Number.NaN,
    byIndex: new Map<number, CarouselSlideCssVars>(),
  });

  const slideStyleFor = useMemo(() => {
    const cache = laneCacheRef.current;
    if (cache.origin !== layoutOrigin) {
      cache.origin = layoutOrigin; // recenter re-bases every lane
      cache.byIndex.clear();
    } else {
      const live = new Set(virtualSlides.map((slide) => slide.virtualIndex));
      for (const index of cache.byIndex.keys()) {
        if (!live.has(index)) cache.byIndex.delete(index);
      }
    }

    return (virtualIndex: number): CarouselSlideCssVars => {
      const cached = cache.byIndex.get(virtualIndex);
      if (cached) return cached;
      const style = buildSlideCssVars(virtualIndex, layoutOrigin);
      cache.byIndex.set(virtualIndex, style);
      return style;
    };
  }, [layoutOrigin, virtualSlides]);

  const flagAttributes = useMemo(() => buildFlagAttributes(flags), [flags]);

  return {
    classNames,
    slideClassMap,
    rootStyle,
    slideStyleFor,
    flagAttributes,
  };
};
