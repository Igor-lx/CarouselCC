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
  renderWindowStart: number;
}

export function useSlideRenderModel({
  current,
  previous,
  isMoving,
  layout,
  records,
  renderWindowBufferMultiplier,
}: UseSlideRenderModelInput): UseSlideRenderModelResult {
  const persistedWindowRef = useRef<RenderWindow | null>(null);

  const renderWindow = useMemo(() => {
    const next = buildRenderWindow(previous, current, layout, renderWindowBufferMultiplier);

    if (!layout.canSlide || !isMoving) {
      persistedWindowRef.current = next;
      return next;
    }

    const previousWindow = persistedWindowRef.current ?? next;
    const segmentWindow = buildSegmentWindow(previous, current, layout);

    if (windowContains(previousWindow, segmentWindow)) return previousWindow;

    const expanded = expandWindow(previousWindow, next);
    persistedWindowRef.current = expanded;
    return expanded;
  }, [current, isMoving, layout, previous, renderWindowBufferMultiplier]);

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
        isActive,
        isActual,
        ariaProps,
      };
    });
  }, [current, isMoving, layout, previous, records, renderWindow]);

  return {
    virtualSlides,
    renderWindowStart: renderWindow.start,
  };
}
