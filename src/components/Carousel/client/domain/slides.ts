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
 * The single-set-mode candidate: the LARGEST image across ALL of the slide's
 * sets (the default `srcSet` AND every art-directed `<source>`) — "quality
 * first, no economy" means the most pixels the data offers anywhere, with
 * ZERO orientation/layout semantics: the host fits whatever wins via plain
 * `object-fit`.
 *
 * "Largest" is measured honestly by what the data declares:
 * - when EVERY set carries its `aspect` metadata (width / height of the
 *   crop), candidates compare by pixel AREA (`width² / aspect`) — the true
 *   "biggest image";
 * - otherwise `w` descriptors are the only size signal and candidates
 *   compare by WIDTH alone (area is unknowable — the resolver never guesses
 *   heights).
 * Exact ties keep the DEFAULT set's candidate (the canonical set), then
 * earlier source order — deterministic, semantics-free.
 */
export const resolveLargestImageCandidate = (image: Slide["image"]): string | null => {
  interface SetCandidate {
    url: string;
    width: number;
    aspect: number | undefined;
  }
  const candidates: SetCandidate[] = [];
  const consider = (srcSet: string | undefined, aspect: number | undefined) => {
    const largest = resolveLargestSrcSetCandidate(srcSet);
    if (largest) candidates.push({ ...largest, aspect });
  };
  consider(image?.srcSet, image?.aspect);
  for (const source of image?.sources ?? []) {
    consider(source.srcSet, source.aspect);
  }
  if (candidates.length === 0) return null;

  const isAreaComparable = candidates.every(
    (candidate) => typeof candidate.aspect === "number" && candidate.aspect > 0,
  );
  const score = (candidate: SetCandidate): number =>
    isAreaComparable
      ? (candidate.width * candidate.width) / (candidate.aspect as number)
      : candidate.width;

  // Strictly-greater keeps the earliest (default set first) on exact ties.
  let best = candidates[0]!;
  for (const candidate of candidates.slice(1)) {
    if (score(candidate) > score(best)) best = candidate;
  }
  return best.url;
};

/**
 * The image URL the deck actually RENDERS for a slide, and therefore the URL
 * the image-resource store tracks (load / error / retry). One resolution rule
 * shared by the slide renderer and the store retention, so they can never
 * key on different URLs:
 *
 * - responsive mode (`<ResponsiveImages />` mounted): the canonical
 *   `content` URL — the browser upgrades it via `srcSet` / `<source>`;
 * - single-set mode (module absent): the LARGEST candidate across ALL sets
 *   (see `resolveLargestImageCandidate`) — the deliberate "quality first,
 *   no economy" mode. Slide identity is untouched either way (`dataKey`
 *   stays on `id + content`).
 */
export const resolveRenderedImageSrc = (
  slideData: Slide,
  isResponsiveImagesOn: boolean,
): string | null => {
  const { content, image } = slideData;
  if (typeof content !== "string") return null;
  if (isResponsiveImagesOn) return content;
  return resolveLargestImageCandidate(image) ?? content;
};

/** Whether any slide in the deck carries responsive image variants. */
export const deckCarriesImageSets = (records: CarouselSlideRecord[]): boolean =>
  records.some(
    (record) =>
      record.slideData.image?.srcSet !== undefined ||
      (record.slideData.image?.sources?.length ?? 0) > 0,
  );
