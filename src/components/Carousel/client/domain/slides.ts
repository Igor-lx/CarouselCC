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

/**
 * Pad the deck with clones drawn from the head so the total length is a
 * multiple of `visibleSlidesCount`. Used when `isFullPagesOn` is true so
 * the last page is not visually short.
 */
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

/**
 * Parse a `w`-descriptor `srcSet` and return the LARGEST candidate URL with
 * its width. Entries without a width descriptor count as width 0; a
 * malformed or empty srcSet yields `null`.
 */
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

/**
 * The single-set-mode FALLBACK candidate for data that does not designate
 * one (`image.defaultSrc` absent): the widest candidate across ALL of the
 * slide's sets (the default `srcSet` AND every art-directed `<source>`).
 * `w` descriptors are the only size signal the data carries, so width is
 * the whole rule — the resolver never guesses heights, orientations or
 * layouts. Exact ties keep the default `srcSet`'s candidate, then earlier
 * source order — deterministic, semantics-free.
 */
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

/**
 * The image URL the deck actually RENDERS for a slide, and therefore the URL
 * the image-resource store tracks (load / error / retry). One resolution rule
 * shared by the slide renderer and the store retention, so they can never
 * key on different URLs:
 *
 * - responsive mode (`<ResponsiveImages />` mounted): the canonical
 *   `content` URL — the browser upgrades it via `srcSet` / `<source>`;
 * - single-set mode (module absent): the publisher's DESIGNATED asset
 *   (`image.defaultSrc`) when the data declares one — a human who split the
 *   deck into sets already knows which asset stands alone; otherwise the
 *   widest candidate across all sets (`resolveLargestImageCandidate`), and
 *   finally the `content` URL itself. Slide identity is untouched either
 *   way (`dataKey` stays on `id + content`).
 */
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
