import { useMemo, useRef } from "react";

import {
  buildRenderWindow,
  buildSegmentWindow,
  buildSlideAriaProps,
  expandWindow,
  loopedSlideIndex,
  slideVisibilityFlags,
  windowContains,
  type CarouselLayout,
  type CarouselSlideRecord,
  type RenderWindow,
  type VirtualSlide,
} from "../domain";

interface UseSlideRenderModelInput {
  current: number;
  previous: number;
  isMoving: boolean;
  layout: CarouselLayout;
  records: CarouselSlideRecord[];
  renderWindowBufferMultiplier: number;
}

interface UseSlideRenderModelResult {
  virtualSlides: VirtualSlide[];
  layoutOrigin: number;
}

/** Slots the render window may drift from the layout origin before it recenters
 * — a rare atomic re-baseline, so a per-settle window shift re-rasters nothing.
 * See docs/architecture/motion.md. */
const LAYOUT_ORIGIN_BAND_SLOTS = 512;

export function useSlideRenderModel({
  current,
  previous,
  isMoving,
  layout,
  records,
  renderWindowBufferMultiplier,
}: UseSlideRenderModelInput): UseSlideRenderModelResult {
  // Persists across renders so a slide is never unmounted mid-flight (shrinks
  // on settle); seeded lazily by the idle branch below (the carousel mounts idle).
  const persistedWindowRef = useRef<RenderWindow | null>(null);
  const layoutOriginRef = useRef<number | null>(null);

  const renderWindow = useMemo(() => {
    const next = buildRenderWindow(
      previous,
      current,
      layout,
      renderWindowBufferMultiplier,
    );

    if (!layout.canSlide || !isMoving) {
      persistedWindowRef.current = next;
      return next;
    }

    const previousWindow = persistedWindowRef.current ?? next; // ?? is a defensive fallback
    const segmentWindow = buildSegmentWindow(previous, current, layout);

    if (windowContains(previousWindow, segmentWindow)) return previousWindow;

    const expanded = expandWindow(previousWindow, next);
    persistedWindowRef.current = expanded;
    return expanded;
  }, [current, isMoving, layout, previous, renderWindowBufferMultiplier]);

  // Stable coordinate base; recenters only on a whole-band drift, so a settle
  // window shift changes no slide's lane (the no-re-raster win; see motion.md).
  const layoutOrigin = useMemo(() => {
    const origin = layoutOriginRef.current;
    if (
      origin === null ||
      renderWindow.start < origin - LAYOUT_ORIGIN_BAND_SLOTS ||
      renderWindow.end > origin + LAYOUT_ORIGIN_BAND_SLOTS
    ) {
      layoutOriginRef.current = renderWindow.start;
      return renderWindow.start;
    }
    return origin;
  }, [renderWindow]);

  // One VirtualSlide object per virtual index, reused while nothing about it
  // changed. `virtualSlides` is rebuilt on EVERY dispatch — twice per ride,
  // because the visibility flags depend on `isMoving` — yet the only fields
  // that ever move are the two flags, and only for the two or three slides at
  // the band's edges.
  // CONSTRAINT — without this cache every dispatch mints N slide objects, N
  // `ariaProps` objects and N `aria-label` strings, and hands every memoised
  // SlideItem a fresh `ariaProps` to shallow-compare: the whole deck then
  // re-renders in the two frames a ride starts and settles in. The lane styles
  // (`laneCacheRef` in presentation) are cached for the same reason.
  const slideCacheRef = useRef(new Map<number, VirtualSlide>());

  const virtualSlides = useMemo<VirtualSlide[]>(() => {
    const totalSlides = records.length;
    if (totalSlides === 0) return [];

    const cache = slideCacheRef.current;
    const live = new Set<number>();

    const length = Math.max(0, renderWindow.end - renderWindow.start + 1);
    const slides = Array.from({ length }, (_, offset) => {
      const virtualIndex = renderWindow.start + offset;
      live.add(virtualIndex);
      const record = records[loopedSlideIndex(virtualIndex, totalSlides)]!;
      const usesCloneKey =
        layout.canSlide &&
        !layout.isFinite &&
        (virtualIndex < 0 || virtualIndex >= totalSlides);

      const { isActual, isActive } = slideVisibilityFlags(
        virtualIndex,
        current,
        previous,
        layout.visibleSlidesCount,
        isMoving,
      );

      const slideKey = usesCloneKey
        ? `clone:${record.slideKey}:${virtualIndex}`
        : record.slideKey;

      // Nothing about this slide moved — hand back the very same object, so
      // its `ariaProps` stays referentially identical and SlideItem's memo
      // holds without re-comparing a fresh one.
      const cached = cache.get(virtualIndex);
      if (
        cached &&
        cached.isActive === isActive &&
        cached.isActual === isActual &&
        cached.slideKey === slideKey &&
        cached.slideData === record.slideData
      ) {
        return cached;
      }

      const next: VirtualSlide = {
        slideData: record.slideData,
        slideKey,
        virtualIndex,
        isActive,
        isActual,
        // `isActual` is the only input the aria payload has beyond the record,
        // so it is rebuilt exactly when the identity check above already failed.
        ariaProps: buildSlideAriaProps(
          record.layoutIndex,
          isActual,
          totalSlides,
        ),
      };
      cache.set(virtualIndex, next);
      return next;
    });

    // Bounded memory: an index that left the render window will be rebuilt if
    // it ever comes back, and its lane/record may differ by then anyway.
    for (const virtualIndex of cache.keys()) {
      if (!live.has(virtualIndex)) cache.delete(virtualIndex);
    }

    return slides;
  }, [current, isMoving, layout, previous, records, renderWindow]);

  return {
    virtualSlides,
    layoutOrigin,
  };
}
