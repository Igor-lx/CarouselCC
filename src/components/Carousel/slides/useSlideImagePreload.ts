import { useEffect, useMemo, useRef } from "react";

import { PRELOAD_NEIGHBOR_PAGE_SPAN } from "../config";
import {
  loopedSlideIndex,
  type CarouselLayout,
  type CarouselSlideRecord,
} from "../domain";

interface UseSlideImagePreloadInput {
  records: CarouselSlideRecord[];
  layout: CarouselLayout;
  currentVirtualIndex: number;
  isIdle: boolean;
  isContentImg: boolean;
  /** When true, speculative warming is skipped entirely. */
  isDataSaverEnabled: boolean;
  /**
   * Read-only gate deciding whether a URL is worth warming. Injected by the
   * caller (typically "the render store does not already mark it failed") so
   * this hook stays store-agnostic and never spends a fetch on a known-bad URL.
   */
  isWarmable: (url: string) => boolean;
}

interface CollectInput {
  records: CarouselSlideRecord[];
  layout: CarouselLayout;
  currentVirtualIndex: number;
  neighborPageSpan: number;
}

const slideImageSource = (record: CarouselSlideRecord): string | null =>
  typeof record.slideData.content === "string" ? record.slideData.content : null;

/** Distance from a virtual index to the nearest edge of the visible band. */
const bandDistance = (index: number, bandStart: number, bandEnd: number): number =>
  index < bandStart ? bandStart - index : index - bandEnd;

/**
 * Image URLs of the **off-band** slides within `neighborPageSpan` page screens
 * of the visible band, nearest-first. The visible band is excluded — its real
 * `<img>`s are already fetching at high priority — so this only warms what a
 * next/previous step would reveal. Exclusion is by *resolved URL*, not just by
 * virtual index: in a small looped deck an off-band virtual index can wrap onto
 * a currently-visible record, and a deck may reuse one URL across slides; either
 * way a URL the visible band already shows is never warmed again. Pure: no DOM,
 * no React.
 */
export const collectIdlePreloadUrls = ({
  records,
  layout,
  currentVirtualIndex,
  neighborPageSpan,
}: CollectInput): string[] => {
  const recordCount = records.length;
  if (recordCount === 0 || !layout.canSlide) return [];

  const visible = layout.visibleSlidesCount;
  const current = Math.round(currentVirtualIndex);
  const radius = visible * neighborPageSpan;
  const bandStart = current;
  const bandEnd = current + visible - 1;

  const resolveRecordIndex = (virtualIndex: number): number | null =>
    layout.isFinite
      ? virtualIndex >= 0 && virtualIndex < recordCount
        ? virtualIndex
        : null
      : loopedSlideIndex(virtualIndex, recordCount);

  const urlAt = (virtualIndex: number): string | null => {
    const recordIndex = resolveRecordIndex(virtualIndex);
    return recordIndex === null ? null : slideImageSource(records[recordIndex]!);
  };

  // URLs the visible band already owns — never warm these speculatively.
  const visibleUrls = new Set<string>();
  for (let index = bandStart; index <= bandEnd; index += 1) {
    const src = urlAt(index);
    if (src) visibleUrls.add(src);
  }

  const indices: number[] = [];
  for (let index = bandStart - radius; index <= bandEnd + radius; index += 1) {
    if (index >= bandStart && index <= bandEnd) continue; // visible band: skip
    indices.push(index);
  }
  indices.sort(
    (a, b) => bandDistance(a, bandStart, bandEnd) - bandDistance(b, bandStart, bandEnd),
  );

  const urls = new Set<string>();
  for (const virtualIndex of indices) {
    const src = urlAt(virtualIndex);
    if (src && !visibleUrls.has(src)) urls.add(src);
  }
  return [...urls];
};

const releaseWarmImage = (image: HTMLImageElement): void => {
  // Dropping the `src` lets the browser release the decoded bitmap; the fetched
  // bytes stay in the HTTP cache. No handlers are attached, so nothing else to
  // detach.
  image.removeAttribute("src");
};

/**
 * Lightweight idle predecode.
 *
 * While the carousel is idle, it warms the browser's fetch + decoded-image
 * caches for the off-band neighbour slides a single step can reveal, so a slide
 * entering the render window during the next motion paints from a warm cache
 * instead of fetching/decoding on the frame it mounts.
 *
 * It is deliberately decoupled from the image-resource store: it never publishes
 * render status. Each rendered `<img>` remains the sole authority on its own
 * outcome; this hook only pre-warms the platform caches the element will hit.
 *
 * Bounded and churn-free: the retained offscreen `Image` set is reconciled to
 * the current neighbour window (warming new entries, releasing those that leave
 * it) only while idle. During motion the set is left untouched, so a step does
 * not drop and re-warm what it is about to use. Warming is skipped entirely when
 * image content is off or the host reports reduced data usage. `decode()` is
 * asynchronous, so warming never blocks the main thread.
 */
export function useSlideImagePreload({
  records,
  layout,
  currentVirtualIndex,
  isIdle,
  isContentImg,
  isDataSaverEnabled,
  isWarmable,
}: UseSlideImagePreloadInput): void {
  const isEnabled = isContentImg && !isDataSaverEnabled;
  const warmedRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // `null` means "leave the warm set as-is" (mid-motion: no churn). An array —
  // including the empty array when disabled — means "reconcile to this set".
  const targetUrls = useMemo<string[] | null>(() => {
    if (!isEnabled) return [];
    if (!isIdle) return null;
    return collectIdlePreloadUrls({
      records,
      layout,
      currentVirtualIndex,
      neighborPageSpan: PRELOAD_NEIGHBOR_PAGE_SPAN,
    });
  }, [isEnabled, isIdle, records, layout, currentVirtualIndex]);

  useEffect(() => {
    if (targetUrls === null || typeof window === "undefined") return;

    const warmed = warmedRef.current;
    const keep = new Set(targetUrls);

    warmed.forEach((image, url) => {
      if (keep.has(url)) return;
      releaseWarmImage(image);
      warmed.delete(url);
    });

    for (const url of targetUrls) {
      if (warmed.has(url) || !isWarmable(url)) continue;
      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      image.src = url;
      warmed.set(url, image);
      // Async decode warms the decoded-image cache off the main thread; a
      // rejection (e.g. the URL is later dropped) is harmless.
      if (typeof image.decode === "function") {
        image.decode().catch(() => undefined);
      }
    }
  }, [targetUrls, isWarmable]);

  useEffect(() => {
    const warmed = warmedRef.current;
    return () => {
      warmed.forEach(releaseWarmImage);
      warmed.clear();
    };
  }, []);
}
