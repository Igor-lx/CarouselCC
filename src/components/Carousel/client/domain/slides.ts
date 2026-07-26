import type { Slide } from "../public-api/types";
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

/** Pad the deck with head clones so the length is a multiple of
 * `visibleSlidesCount`, so the last page is never visually short. */
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

/** Largest-width candidate from a `w`-descriptor `srcSet`; entries without a
 * width count as 0, and an empty or malformed srcSet yields `null`. */
export const resolveLargestSrcSetCandidate = (
  srcSet: string | undefined,
): { url: string; width: number } | null => {
  if (!srcSet) return null;
  let best: { url: string; width: number } | null = null;
  for (const entry of srcSet.split(",")) {
    const parts = entry.trim().split(/\s+/);
    const url = parts[0];
    if (!url) continue;
    const match = parts[1]?.match(/^(\d+(?:\.\d+)?)w$/);
    const width = match ? Number(match[1]) : 0;
    if (best === null || width > best.width) {
      best = { url, width };
    }
  }
  return best;
};

/** Single-set fallback when the data designates no standalone asset: the
 * widest candidate across the default `srcSet` and every art-directed
 * `<source>`. Ties keep the default srcSet, then earlier source order. */
export const resolveLargestImageCandidate = (image: Slide["image"]): string | null => {
  let best: { url: string; width: number } | null = null;
  const consider = (srcSet: string | undefined) => {
    const largest = resolveLargestSrcSetCandidate(srcSet);
    // Strictly-greater keeps the earliest (default srcSet first) on ties.
    if (largest && (best === null || largest.width > best.width)) best = largest;
  };
  consider(image?.srcSet);
  for (const source of image?.sources ?? []) consider(source.srcSet);
  return best === null ? null : (best as { url: string }).url;
};

/** The image URL the deck RENDERS for a slide — the one rule the renderer and
 * the resource store share so they can never key on different URLs. Responsive
 * mode: the canonical `content`. Single-set mode: the designated
 * `image.defaultSrc`, else the widest candidate, else `content`. */
export const resolveRenderedImageSrc = (
  slideData: Slide,
  isResponsiveImagesOn: boolean,
): string | null => {
  const { content, image } = slideData;
  if (typeof content !== "string") return null;
  if (isResponsiveImagesOn) return content;
  return image?.defaultSrc ?? resolveLargestImageCandidate(image) ?? content;
};

/** Whether any slide in the deck carries responsive image variants. */
export const deckCarriesImageSets = (records: CarouselSlideRecord[]): boolean =>
  records.some(
    (record) =>
      record.slideData.image?.srcSet !== undefined ||
      (record.slideData.image?.sources?.length ?? 0) > 0,
  );
