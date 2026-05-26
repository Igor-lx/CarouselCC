import type { Slide } from "../contract/types";
import { clamp, mod, normalizePageIndex } from "./math";
import { clampedVisibleSlidesCount } from "./slides";
import type { CarouselLayout, CarouselSlideRecord, PageBoundaryState } from "./types";

const slideContentKey = (slide: Slide) =>
  `${slide.id}-${typeof slide.content === "string" ? slide.content : "obj"}`;

const buildDataKey = (records: CarouselSlideRecord[]): string => {
  let key = "";

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    if (index > 0) key += "|";
    key += `${record.slideKey}-${slideContentKey(record.slideData)}`;
  }

  return key;
};

export const pageStart = (pageIndex: number, visibleSlidesCount: number) =>
  pageIndex * visibleSlidesCount;

export const buildCarouselLayout = (
  records: CarouselSlideRecord[],
  visibleSlidesCount: number,
  isFinite: boolean,
): CarouselLayout => {
  const length = records.length;
  const effectiveVisible = clampedVisibleSlidesCount(length, visibleSlidesCount);
  const canSlide = length > effectiveVisible;
  const pageCount = effectiveVisible > 0 ? Math.ceil(length / effectiveVisible) : 0;
  const virtualLength = canSlide && !isFinite ? pageCount * effectiveVisible : length;
  const dataKey = buildDataKey(records);

  return {
    length,
    visibleSlidesCount: effectiveVisible,
    virtualLength,
    pageCount,
    canSlide,
    isFinite,
    dataKey,
  };
};

/**
 * Reconstructs the virtual index for a page so that it stays on the same
 * cyclic "lane" as the reference virtual index. Used when navigating to a
 * page index that may live on a different cycle than the current motion
 * origin.
 */
export const alignedVirtualIndex = (
  pageIndex: number,
  referenceVirtualIndex: number,
  layout: CarouselLayout,
) => {
  const normalized = normalizePageIndex(pageIndex, layout.pageCount);
  const start = pageStart(normalized, layout.visibleSlidesCount);
  if (layout.isFinite || layout.virtualLength <= 0) return start;
  const lane = Math.round((referenceVirtualIndex - start) / layout.virtualLength);
  return start + lane * layout.virtualLength;
};

export const nearestPageIndex = (virtualIndex: number, layout: CarouselLayout) => {
  if (layout.pageCount <= 0 || layout.visibleSlidesCount <= 0) return 0;
  const raw = Math.round(virtualIndex / layout.visibleSlidesCount);
  return layout.isFinite
    ? clamp(raw, 0, layout.pageCount - 1)
    : normalizePageIndex(raw, layout.pageCount);
};

export const carouselBoundaryState = (
  targetPageIndex: number,
  layout: CarouselLayout,
): PageBoundaryState => {
  if (!layout.isFinite) return { isAtStart: false, isAtEnd: false };
  return {
    isAtStart: targetPageIndex <= 0,
    isAtEnd: targetPageIndex >= layout.pageCount - 1,
  };
};

export const reconciledPageIndex = (
  currentPageIndex: number,
  prevLayout: CarouselLayout,
  nextLayout: CarouselLayout,
) => {
  if (prevLayout.pageCount <= 1 || nextLayout.pageCount <= 1) return 0;
  const oldMax = Math.max(1, prevLayout.pageCount - 1);
  const progress = clamp(currentPageIndex, 0, oldMax) / oldMax;
  const nextMax = Math.max(1, nextLayout.pageCount - 1);
  return clamp(Math.round(progress * nextMax), 0, nextLayout.pageCount - 1);
};

export const loopedSlideIndex = (virtualIndex: number, totalSlides: number) =>
  mod(virtualIndex, totalSlides);
