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

/**
 * How far (in slots) the render window may drift from the layout origin
 * before the origin recenters. The origin is the coordinate base for the
 * scroll transform and every slide's lane; keeping it stable is what makes a
 * per-settle window shift move no slide (no re-raster). A finite deck's
 * window never leaves `[0, length)`, so its origin never moves. An infinite
 * deck recenters only after this many slots of one-way drift — a rare,
 * atomic re-baseline that also bounds the transform magnitude.
 */
const LAYOUT_ORIGIN_BAND_SLOTS = 512;

export function useSlideRenderModel({
  current,
  previous,
  isMoving,
  layout,
  records,
  renderWindowBufferMultiplier,
}: UseSlideRenderModelInput): UseSlideRenderModelResult {
  // The expanded render window persists across renders so a slide is never
  // unmounted mid-flight (it shrinks back only when motion settles). The ref
  // starts null and is seeded by the idle branch of the memo below on the
  // first render — the carousel always mounts idle — so `buildRenderWindow`
  // is computed only inside the memo, never on every render.
  const persistedWindowRef = useRef<RenderWindow | null>(null);
  // The layout origin persists across window shifts and recenters only when
  // the window drifts past the band (see LAYOUT_ORIGIN_BAND_SLOTS). Seeded
  // lazily by the first window below.
  const layoutOriginRef = useRef<number | null>(null);

  const renderWindow = useMemo(() => {
    const next = buildRenderWindow(previous, current, layout, renderWindowBufferMultiplier);

    if (!layout.canSlide || !isMoving) {
      persistedWindowRef.current = next;
      return next;
    }

    // Non-null here: the idle branch above seeds the ref on the first render.
    // `next` is a defensive fallback for a hypothetical first-render-while-
    // moving, which the mount-idle invariant rules out.
    const previousWindow = persistedWindowRef.current ?? next;
    const segmentWindow = buildSegmentWindow(previous, current, layout);

    if (windowContains(previousWindow, segmentWindow)) return previousWindow;

    const expanded = expandWindow(previousWindow, next);
    persistedWindowRef.current = expanded;
    return expanded;
  }, [current, isMoving, layout, previous, renderWindowBufferMultiplier]);

  // Stable coordinate base for the scroll transform and the slide lanes. It
  // recenters only when the window has drifted a whole band away (or on a
  // layout reset that puts the window start out of band), so a per-settle
  // window shift changes NO slide's lane — the crux of the no-re-raster win.
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

  const virtualSlides = useMemo<VirtualSlide[]>(() => {
    const totalSlides = records.length;
    if (totalSlides === 0) return [];

    const length = Math.max(0, renderWindow.end - renderWindow.start + 1);
    return Array.from({ length }, (_, offset) => {
      const virtualIndex = renderWindow.start + offset;
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

      const ariaProps = buildSlideAriaProps(record.layoutIndex, isActual, totalSlides);

      return {
        slideData: record.slideData,
        slideKey: usesCloneKey
          ? `clone:${record.slideKey}:${virtualIndex}`
          : record.slideKey,
        virtualIndex,
        isActive,
        isActual,
        ariaProps,
      };
    });
  }, [current, isMoving, layout, previous, records, renderWindow]);

  return {
    virtualSlides,
    layoutOrigin,
  };
}
