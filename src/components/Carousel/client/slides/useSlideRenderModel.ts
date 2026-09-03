import { useMemo, useState } from "react";

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

const sameWindow = (a: RenderWindow, b: RenderWindow): boolean =>
  a.start === b.start && a.end === b.end;

export function useSlideRenderModel({
  current,
  previous,
  isMoving,
  layout,
  records,
  renderWindowBufferMultiplier,
}: UseSlideRenderModelInput): UseSlideRenderModelResult {
  const freshWindow = useMemo(
    () =>
      buildRenderWindow(
        previous,
        current,
        layout,
        renderWindowBufferMultiplier,
      ),
    [current, layout, previous, renderWindowBufferMultiplier],
  );

  // The window persists across renders so a slide is never unmounted mid-flight
  // (it shrinks on settle). CONSTRAINT — it is state, not a ref written from a
  // memo: React may discard a memo's cache whenever it likes, and this value has
  // to outlive that. Holding it in state also keeps its identity across renders
  // that change nothing, which the caches below depend on.
  const [renderWindow, setRenderWindow] = useState(freshWindow);

  const targetWindow = useMemo(() => {
    if (!layout.canSlide || !isMoving) return freshWindow;

    const segmentWindow = buildSegmentWindow(previous, current, layout);
    if (windowContains(renderWindow, segmentWindow)) return renderWindow;

    return expandWindow(renderWindow, freshWindow);
  }, [current, freshWindow, isMoving, layout, previous, renderWindow]);

  if (!sameWindow(renderWindow, targetWindow)) setRenderWindow(targetWindow);

  // Stable coordinate base; recenters only on a whole-band drift, so a settle
  // window shift changes no slide's lane (the no-re-raster win; see motion.md).
  // Seeded from the mount's own window, not from `null`: "not decided yet" would
  // be a state that exists for exactly one render, and paying for it costs a
  // whole extra pass over the deck before the first paint.
  const [committedOrigin, setCommittedOrigin] = useState(
    () => freshWindow.start,
  );
  const layoutOrigin =
    renderWindow.start < committedOrigin - LAYOUT_ORIGIN_BAND_SLOTS ||
    renderWindow.end > committedOrigin + LAYOUT_ORIGIN_BAND_SLOTS
      ? renderWindow.start
      : committedOrigin;

  if (layoutOrigin !== committedOrigin) setCommittedOrigin(layoutOrigin);

  // One VirtualSlide object per virtual index, reused while nothing about it
  // changed. `virtualSlides` is rebuilt on EVERY dispatch — twice per ride,
  // because the visibility flags depend on `isMoving` — yet the only fields
  // that ever move are the two flags, and only for the two or three slides at
  // the band's edges.
  // MEASURED — it saves allocations, not renders. The deck re-renders
  // identically without it: `ariaProps` is SPREAD at the call site, so what
  // reaches SlideItem's memo is four primitives compared by value, and no
  // other prop carries this object's identity — the lane style comes from
  // presentation's own cache. What the cache does save is N slide objects, N
  // `ariaProps` and N `aria-label` strings per dispatch, twice per ride.
  // The numbers, and the control proving the instrument can see a re-render,
  // are in `slides/tests/slideRenderCost.test.tsx`. Whether that saving is
  // worth two suppressed lint rules is an open decision, deferred until it can
  // be felt on real devices; it is item 8 of the project's deferred-work list.
  // Owned by a memo with no inputs, so it lives as long as the hook does and
  // no render writes a ref to keep it.
  const slideCache = useMemo(() => new Map<number, VirtualSlide>(), []);

  const virtualSlides = useMemo<VirtualSlide[]>(() => {
    const totalSlides = records.length;
    if (totalSlides === 0) return [];

    const cache = slideCache;
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
      // eslint-disable-next-line react-hooks/immutability -- a per-instance identity cache: the rule wants no mutation of a value from an outer scope; measured to save allocations rather than renders, kept pending the decision above
      cache.set(virtualIndex, next);
      return next;
    });

    // Bounded memory: an index that left the render window will be rebuilt if
    // it ever comes back, and its lane/record may differ by then anyway.
    for (const virtualIndex of cache.keys()) {
      // eslint-disable-next-line react-hooks/immutability -- same cache, its bounded-memory half
      if (!live.has(virtualIndex)) cache.delete(virtualIndex);
    }

    return slides;
  }, [current, isMoving, layout, previous, records, renderWindow, slideCache]);

  return {
    virtualSlides,
    layoutOrigin,
  };
}
