import type { Slide } from "../contract/types";
import type { CarouselSlideRecord } from "./types";

const clampedVisibleSlidesCount = (length: number, visibleSlidesCount: number) =>
  Math.min(visibleSlidesCount, length);

const buildKey = (slide: Slide, layoutIndex: number, isClone: boolean): string =>
  isClone
    ? `slide:${String(slide.id)}:layout-clone:${layoutIndex}`
    : `slide:${String(slide.id)}`;

export const buildSlideRecords = (slidesData: Slide[]): CarouselSlideRecord[] =>
  slidesData.map((slide, index) => ({
    slideData: slide,
    layoutIndex: index,
    slideKey: buildKey(slide, index, false),
  }));

export const hasPartialPageLayout = (length: number, visibleSlidesCount: number) => {
  if (length === 0) return false;
  const effective = clampedVisibleSlidesCount(length, visibleSlidesCount);
  return length % effective !== 0;
};

export const padDeckToFullPage = (
  records: CarouselSlideRecord[],
  visibleSlidesCount: number,
): CarouselSlideRecord[] => {
  const length = records.length;
  if (!hasPartialPageLayout(length, visibleSlidesCount)) return records;
  const effective = clampedVisibleSlidesCount(length, visibleSlidesCount);
  const padded = Math.ceil(length / effective) * effective;
  const appended = Array.from({ length: padded - length }, (_, offset) => {
    const source = records[offset % length]!;
    return {
      slideData: source.slideData,
      layoutIndex: length + offset,
      slideKey: buildKey(source.slideData, length + offset, true),
    };
  });
  return [...records, ...appended];
};

export { clampedVisibleSlidesCount };
