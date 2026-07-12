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
 * Parse a `w`-descriptor `srcSet` and return the LARGEST candidate URL.
 * Entries without a width descriptor count as width 0; a malformed or empty
 * srcSet yields `null`.
 */
export const resolveLargestSrcSetCandidate = (
  srcSet: string | undefined,
): string | null => {
  if (!srcSet) return null;
  let bestUrl: string | null = null;
  let bestWidth = -1;
  for (const entry of srcSet.split(",")) {
    const parts = entry.trim().split(/\s+/);
    const url = parts[0];
    if (!url) continue;
    const match = parts[1]?.match(/^(\d+(?:\.\d+)?)w$/);
    const width = match ? Number(match[1]) : 0;
    if (width > bestWidth) {
      bestWidth = width;
      bestUrl = url;
    }
  }
  return bestUrl;
};

/**
 * The image URL the deck actually RENDERS for a slide, and therefore the URL
 * the image-resource store tracks (load / error / retry). One resolution rule
 * shared by the slide renderer and the store retention, so they can never
 * key on different URLs:
 *
 * - responsive mode (`<ResponsiveImages />` mounted): the canonical
 *   `content` URL — the browser upgrades it via `srcSet` / `<source>`;
 * - single-set mode (module absent): the LARGEST default-set candidate —
 *   the deliberate "quality first, no economy" mode. Slide identity is
 *   untouched either way (`dataKey` stays on `id + content`).
 */
export const resolveRenderedImageSrc = (
  slideData: Slide,
  isResponsiveImagesOn: boolean,
): string | null => {
  const { content, image } = slideData;
  if (typeof content !== "string") return null;
  if (isResponsiveImagesOn) return content;
  return resolveLargestSrcSetCandidate(image?.srcSet) ?? content;
};

/** Whether any slide in the deck carries responsive image variants. */
export const deckCarriesImageSets = (records: CarouselSlideRecord[]): boolean =>
  records.some(
    (record) =>
      record.slideData.image?.srcSet !== undefined ||
      (record.slideData.image?.sources?.length ?? 0) > 0,
  );
