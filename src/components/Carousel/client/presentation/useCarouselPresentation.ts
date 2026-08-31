// See docs/architecture/presentation.md
import { useCallback, useEffect, useMemo, useRef } from "react";

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
  //
  // CONSTRAINT — a ref, never a memo. React may discard a memo cache at any
  // time; the styles would then re-identify and defeat SlideItem's memo in the
  // two frames a ride can least afford it. Same reasoning as the render window
  // next door, and it is as untestable here as it is there.
  const laneCacheRef = useRef(new Map<string, CarouselSlideCssVars>());

  const slideStyleFor = useCallback(
    (virtualIndex: number): CarouselSlideCssVars => {
      const cache = laneCacheRef.current;
      // The origin is part of the key, so a recenter cannot serve a stale lane
      // and nothing has to be invalidated synchronously — the old entries are
      // simply never hit again, and the effect below drops them.
      const key = `${layoutOrigin}:${virtualIndex}`;
      const cached = cache.get(key);
      if (cached) return cached;
      const style = buildSlideCssVars(virtualIndex, layoutOrigin);
      cache.set(key, style);
      return style;
    },
    [layoutOrigin],
  );

  // Bounded memory, after the commit: everything that is not a live lane at the
  // current origin goes, which covers a window shift and a recenter alike.
  useEffect(() => {
    const live = new Set(
      virtualSlides.map((slide) => `${layoutOrigin}:${slide.virtualIndex}`),
    );
    const cache = laneCacheRef.current;
    for (const key of cache.keys()) {
      if (!live.has(key)) cache.delete(key);
    }
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
