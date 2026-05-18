import { useEffect, useMemo } from "react";

import {
  loopedSlideIndex,
  type CarouselLayout,
  type CarouselSlideRecord,
} from "../domain";
import {
  PRELOAD_PAGE_LOOKAHEAD_BY_VISIBLE,
  PRELOAD_PAGE_LOOKAHEAD_DEFAULT,
} from "../config";
import type { ImageResourceStore } from "./imageResource";

interface UseSlideImagePreloadInput {
  records: CarouselSlideRecord[];
  layout: CarouselLayout;
  currentVirtualIndex: number;
  isIdle: boolean;
  isContentImg: boolean;
  /** `null` when `isContentImg` is off — the hook then does no work at all. */
  store: ImageResourceStore | null;
}

/** Stable empty list — keeps effect dependencies referentially constant. */
const EMPTY_URLS: readonly string[] = Object.freeze([]);

const slideImageSource = (record: CarouselSlideRecord): string | null =>
  typeof record.slideData.content === "string"
    ? record.slideData.content
    : null;

/** Every distinct image URL in the deck — the upper bound the store retains. */
const collectDeckImageUrls = (records: CarouselSlideRecord[]): string[] => {
  const urls = new Set<string>();
  for (const record of records) {
    const src = slideImageSource(record);
    if (src) urls.add(src);
  }
  return [...urls];
};

const finiteWindowIndex = (
  virtualIndex: number,
  recordCount: number,
): number | null =>
  recordCount > 0 && virtualIndex >= 0 && virtualIndex < recordCount
    ? virtualIndex
    : null;

/**
 * Preload radius in *slides*, on each side of the visible band. The carousel
 * steps a whole page (`visibleSlidesCount` slides) at a time, so the radius is
 * `visibleSlidesCount` times the page-lookahead resolved from the schedule.
 */
const resolvePreloadRadius = (visibleSlidesCount: number): number => {
  const lookahead =
    PRELOAD_PAGE_LOOKAHEAD_BY_VISIBLE[visibleSlidesCount] ??
    PRELOAD_PAGE_LOOKAHEAD_DEFAULT;
  return visibleSlidesCount * lookahead;
};

/**
 * Image URLs inside the preload window, ordered nearest-first. The store warms
 * URLs in call order, so emitting the slides closest to the viewport first
 * means the user's most likely next view is decoded before the far neighbours.
 */
const collectPreloadWindowUrls = ({
  records,
  layout,
  currentVirtualIndex,
}: Pick<
  UseSlideImagePreloadInput,
  "records" | "layout" | "currentVirtualIndex"
>): string[] => {
  const recordCount = records.length;
  if (recordCount === 0) return [];

  const current = Math.round(currentVirtualIndex);
  const radius = resolvePreloadRadius(layout.visibleSlidesCount);
  const first = current - radius;
  const last = current + layout.visibleSlidesCount - 1 + radius;

  const windowIndices: number[] = [];
  for (let virtualIndex = first; virtualIndex <= last; virtualIndex += 1) {
    windowIndices.push(virtualIndex);
  }
  windowIndices.sort(
    (a, b) => Math.abs(a - current) - Math.abs(b - current),
  );

  const urls = new Set<string>();
  for (const virtualIndex of windowIndices) {
    const recordIndex = layout.isFinite
      ? finiteWindowIndex(virtualIndex, recordCount)
      : loopedSlideIndex(virtualIndex, recordCount);
    if (recordIndex === null) continue;
    const src = slideImageSource(records[recordIndex]!);
    if (src) urls.add(src);
  }
  return [...urls];
};

/**
 * Drives the image-resource SSOT for image-content carousels.
 *
 * This hook is a thin React adapter with no image logic of its own: it derives
 * two URL sets from the current deck and viewport and hands them to the store,
 * which owns all fetching, decoding, error tracking, and retry.
 *
 *  - The **deck set** bounds what the store retains; it is pushed through
 *    `prune` so memory tracks the live deck and nothing more.
 *  - The **preload window** is the visible band plus a page-lookahead buffer
 *    on each side (see `config/slides`). It is computed (and thus warmed)
 *    only while the carousel is idle — warm-up fetches must never compete
 *    with the network or main thread during an active motion segment.
 *
 * When `isContentImg` is off, `store` is `null` and the URL sets stay the
 * frozen empty list: no traversal of `records`, no effects firing, no fetch,
 * no decode — the hook is fully inert.
 *
 * Image preparation is observation-only: it never feeds back into navigation,
 * layout, motion state, or slide-render semantics.
 */
export function useSlideImagePreload({
  records,
  layout,
  currentVirtualIndex,
  isIdle,
  isContentImg,
  store,
}: UseSlideImagePreloadInput): void {
  const deckUrls = useMemo(
    () => (isContentImg ? collectDeckImageUrls(records) : EMPTY_URLS),
    [isContentImg, records],
  );

  const preloadUrls = useMemo(
    () =>
      isContentImg && isIdle
        ? collectPreloadWindowUrls({ records, layout, currentVirtualIndex })
        : EMPTY_URLS,
    [isContentImg, isIdle, layout, records, currentVirtualIndex],
  );

  // Keep the store's tracked set bounded to the live deck. With no store
  // (image content off) there is nothing to bound, so the effect is inert.
  useEffect(() => {
    if (!store) return;
    store.prune(deckUrls);
  }, [store, deckUrls]);

  // Warm the idle viewport neighbourhood. `preloadUrls` is the stable empty
  // list while moving or when image content is off, so this effect does no
  // work during motion and none at all without a store.
  useEffect(() => {
    if (!store || preloadUrls.length === 0) return;
    store.preload(preloadUrls);
  }, [store, preloadUrls]);
}
