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
  /** Carousel-owned default `sizes` mirrored onto the offscreen warm-up image. */
  imageSizes: string;
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
  imageSizes: string;
  /** Resolves a `<source media>` to whether it currently applies. */
  isMediaMatch?: (media: string) => boolean;
}

/**
 * The exact image descriptor the browser would pick for a slide right now: the
 * matching responsive `<source>` if any (`isMediaMatch`), else the default
 * `srcSet`, with `content` as the identity/fallback `src` and a mirrored
 * `sizes`. `key` collapses identical descriptors so one is warmed once.
 */
export interface SlideImagePreloadTarget {
  key: string;
  src: string;
  srcSet?: string;
  sizes?: string;
}

const slideImagePreloadTarget = (
  record: CarouselSlideRecord,
  imageSizes: string,
  isMediaMatch?: (media: string) => boolean,
): SlideImagePreloadTarget | null => {
  const { content, image } = record.slideData;
  if (typeof content !== "string") return null;

  const matchedSource = image?.sources?.find(
    (source) => isMediaMatch?.(source.media) ?? false,
  );
  const srcSet = matchedSource?.srcSet ?? image?.srcSet;
  const sizes = matchedSource?.sizes ?? image?.sizes ?? imageSizes;
  const key = `${content}|${srcSet ?? ""}|${sizes ?? ""}`;

  return { key, src: content, srcSet, sizes };
};

/** Distance from a virtual index to the nearest edge of the visible band. */
const bandDistance = (index: number, bandStart: number, bandEnd: number): number =>
  index < bandStart ? bandStart - index : index - bandEnd;

/**
 * Descriptors of the **off-band** slides within `neighborPageSpan` page screens
 * of the visible band, nearest-first. The visible band is excluded by resolved
 * `src` (so a small looped deck wrapping onto a visible record, or a reused URL,
 * is never re-warmed). Each descriptor mirrors what `<picture>`/`srcSet` would
 * select, so warming hits the same candidate the rendered `<img>` will. Pure:
 * no DOM, no React (the media match is injected).
 */
export const collectIdlePreloadTargets = ({
  records,
  layout,
  currentVirtualIndex,
  neighborPageSpan,
  imageSizes,
  isMediaMatch,
}: CollectInput): SlideImagePreloadTarget[] => {
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

  const targetAt = (virtualIndex: number): SlideImagePreloadTarget | null => {
    const recordIndex = resolveRecordIndex(virtualIndex);
    return recordIndex === null
      ? null
      : slideImagePreloadTarget(records[recordIndex]!, imageSizes, isMediaMatch);
  };

  // URLs the visible band already owns — never warm these speculatively.
  const visibleUrls = new Set<string>();
  for (let index = bandStart; index <= bandEnd; index += 1) {
    const target = targetAt(index);
    if (target) visibleUrls.add(target.src);
  }

  const indices: number[] = [];
  for (let index = bandStart - radius; index <= bandEnd + radius; index += 1) {
    if (index >= bandStart && index <= bandEnd) continue; // visible band: skip
    indices.push(index);
  }
  indices.sort(
    (a, b) => bandDistance(a, bandStart, bandEnd) - bandDistance(b, bandStart, bandEnd),
  );

  const targets = new Map<string, SlideImagePreloadTarget>();
  for (const virtualIndex of indices) {
    const target = targetAt(virtualIndex);
    if (target && !visibleUrls.has(target.src)) targets.set(target.key, target);
  }
  return [...targets.values()];
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
 * instead of fetching/decoding on the frame it mounts. It mirrors each slide's
 * responsive descriptor (`srcSet` + `sizes`, and the matching `<source>` via
 * `matchMedia`) onto the offscreen `Image`, so it warms exactly the candidate
 * the rendered `<img>`/`<picture>` will pick — never every variant.
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
  imageSizes,
  isIdle,
  isContentImg,
  isDataSaverEnabled,
  isWarmable,
}: UseSlideImagePreloadInput): void {
  const isEnabled = isContentImg && !isDataSaverEnabled;
  const warmedRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // `null` means "leave the warm set as-is" (mid-motion: no churn). An array —
  // including the empty array when disabled — means "reconcile to this set".
  const targets = useMemo<SlideImagePreloadTarget[] | null>(() => {
    if (!isEnabled) return [];
    if (!isIdle) return null;
    return collectIdlePreloadTargets({
      records,
      layout,
      currentVirtualIndex,
      imageSizes,
      neighborPageSpan: PRELOAD_NEIGHBOR_PAGE_SPAN,
      isMediaMatch:
        typeof window === "undefined"
          ? undefined
          : (media) => window.matchMedia(media).matches,
    });
  }, [currentVirtualIndex, imageSizes, isEnabled, isIdle, layout, records]);

  useEffect(() => {
    if (targets === null || typeof window === "undefined") return;

    const warmed = warmedRef.current;
    const keep = new Set(targets.map((target) => target.key));

    warmed.forEach((image, key) => {
      if (keep.has(key)) return;
      releaseWarmImage(image);
      warmed.delete(key);
    });

    for (const target of targets) {
      if (warmed.has(target.key) || !isWarmable(target.src)) continue;
      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      // Mirror the rendered selection so the warmed candidate is the same one
      // the `<img>`/`<picture>` will pick (a bare `src` would warm the wrong
      // resolution/crop).
      if (target.sizes) image.sizes = target.sizes;
      if (target.srcSet) image.srcset = target.srcSet;
      image.src = target.src;
      warmed.set(target.key, image);
      // Async decode warms the decoded-image cache off the main thread; a
      // rejection (e.g. the URL is later dropped) is harmless.
      if (typeof image.decode === "function") {
        image.decode().catch(() => undefined);
      }
    }
  }, [targets, isWarmable]);

  useEffect(() => {
    const warmed = warmedRef.current;
    return () => {
      warmed.forEach(releaseWarmImage);
      warmed.clear();
    };
  }, []);
}
