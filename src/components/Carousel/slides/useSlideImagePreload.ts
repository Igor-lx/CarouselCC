import { useEffect, useMemo } from "react";

import { useDataSaver, useIsomorphicLayoutEffect } from "../../../shared";
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
  /** `null` when `isContentImg` is off - the hook then does no work at all. */
  store: ImageResourceStore | null;
}

/** Stable empty list - keeps effect dependencies referentially constant. */
const EMPTY_URLS: readonly string[] = Object.freeze([]);

const slideImageSource = (record: CarouselSlideRecord): string | null =>
  typeof record.slideData.content === "string"
    ? record.slideData.content
    : null;

/** Every distinct image URL in the deck - the upper bound the store retains. */
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
 * Preload radius in slides, on each side of the visible band. The carousel
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
 *  - The deck set bounds what the store retains; it is pushed through `prune`
 *    so retained entries track the live deck and nothing more.
 *  - The preload window is the visible band plus a page-lookahead buffer on
 *    each side (see `config/slides`). It is computed only while the carousel
 *    is idle and handed to the store as one atomic preparation session.
 *
 * Warm-up is *speculative* and gated on `useDataSaver()`: when the user has
 * opted into reduced data usage (`prefers-reduced-data` / `saveData`) no
 * preparation window is opened, so no eager fetch or decode happens — on any
 * device. The store, its render SSOT, and image error handling / retry stay
 * fully active regardless; only the optional warm-up is skipped.
 *
 * The preparation window is synced in a single layout effect. Correctness
 * does not depend on the order this hook is declared among Carousel's hooks:
 *  - it runs after every `SlideItem` child's `observe` layout effect (React
 *    fires child layout effects before the parent's), so `visibleOwnerCount`
 *    is already accurate when the session opens;
 *  - it runs synchronously before paint, and `syncPreparationWindow` aborts
 *    in-flight warm-up fetches and queued decodes synchronously, so a
 *    transition into motion frees the network/main thread within the same
 *    commit regardless of when the motion runner's own layout effect runs.
 *
 * When `isContentImg` is off, `store` is `null` and the URL sets stay the
 * frozen empty list: no traversal of `records`, no effects firing, no fetch,
 * no decode - the hook is fully inert.
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
  // Speculative warm-up is skipped entirely when the user opted into reduced
  // data usage. This never touches the store or its render SSOT. The signal
  // is observed only for image carousels — a non-image carousel would never
  // warm up regardless, so it does not subscribe to the reduced-data store.
  const isDataSaver = useDataSaver(isContentImg);
  const isWarmupEnabled = isContentImg && !isDataSaver;

  const deckUrls = useMemo(
    () => (isContentImg ? collectDeckImageUrls(records) : EMPTY_URLS),
    [isContentImg, records],
  );

  const preloadUrls = useMemo(
    () =>
      isWarmupEnabled && isIdle
        ? collectPreloadWindowUrls({ records, layout, currentVirtualIndex })
        : EMPTY_URLS,
    [isWarmupEnabled, isIdle, layout, records, currentVirtualIndex],
  );

  // Keep retained entries bounded to the live deck. With no store (image
  // content off) there is nothing to bound, so the effect is inert.
  useEffect(() => {
    if (!store) return;
    store.prune(deckUrls);
  }, [store, deckUrls]);

  // Single owner of the preparation window. Runs in the layout phase so the
  // session is opened after child `observe` effects and closed before paint
  // on entering motion. See the hook docstring for why this needs no ordering
  // assumption against the motion runner.
  useIsomorphicLayoutEffect(() => {
    if (!store) return;
    store.syncPreparationWindow(
      isWarmupEnabled && isIdle
        ? { enabled: true, urls: preloadUrls }
        : { enabled: false, urls: EMPTY_URLS },
    );
  }, [store, isWarmupEnabled, isIdle, preloadUrls]);
}
