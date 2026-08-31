// See docs/architecture/domain.md
import type { Slide } from "../public-api/types";
import type { CarouselSlideRecord } from "./types";

const clampedVisibleSlidesCount = (
  length: number,
  visibleSlidesCount: number,
) => Math.min(visibleSlidesCount, length);

const buildKey = (
  slide: Slide,
  layoutIndex: number,
  isClone: boolean,
): string =>
  isClone
    ? `slide:${String(slide.id)}:layout-clone:${layoutIndex}`
    : `slide:${String(slide.id)}`;

export const buildSlideRecords = (slidesData: Slide[]): CarouselSlideRecord[] =>
  slidesData.map((slide, index) => ({
    slideData: slide,
    layoutIndex: index,
    slideKey: buildKey(slide, index, false),
  }));

export const hasPartialPageLayout = (
  length: number,
  visibleSlidesCount: number,
) => {
  const effective = clampedVisibleSlidesCount(length, visibleSlidesCount);
  // A page of no slides has no partial page to complete. Without this the
  // remainder is NaN, "not whole" reads as true, and the padder returns a
  // fresh array every call — breaking the identity its callers memoise on.
  if (!(effective > 0)) return false;
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

export const resolveLargestImageCandidate = (
  image: Slide["image"],
): string | null => {
  // Default set first, then the art-directed ones in declaration order.
  const sets = [image?.srcSet, ...(image?.sources ?? []).map((s) => s.srcSet)];

  let best: { url: string; width: number } | null = null;
  for (const srcSet of sets) {
    const largest = resolveLargestSrcSetCandidate(srcSet);
    // Strictly-greater keeps the earliest (default srcSet first) on ties.
    if (largest !== null && (best === null || largest.width > best.width)) {
      best = largest;
    }
  }
  return best === null ? null : best.url;
};

// The one rule the renderer and the resource store share — they must key on
// the same URL.
export const resolveRenderedImageSrc = (
  slideData: Slide,
  isResponsiveImagesOn: boolean,
): string | null => {
  const { content, image } = slideData;
  if (typeof content !== "string") return null;
  if (isResponsiveImagesOn) return content;
  return image?.defaultSrc ?? resolveLargestImageCandidate(image) ?? content;
};

export const deckCarriesImageSets = (records: CarouselSlideRecord[]): boolean =>
  records.some(
    (record) =>
      record.slideData.image?.srcSet !== undefined ||
      (record.slideData.image?.sources?.length ?? 0) > 0,
  );
