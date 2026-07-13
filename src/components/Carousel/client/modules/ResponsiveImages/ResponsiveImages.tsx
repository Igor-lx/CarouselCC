import { memo, useEffect, useRef } from "react";

import { useMediaQuery } from "../../../../../shared";
import { SLIDE_PORTRAIT_MEDIA_CONDITION } from "../../config";
import { useCarouselMotion, useCarouselStable } from "../../context";
import type { CarouselSlotComponent } from "../../slots";
import { useResponsiveImagesDiagnostic } from "../Diagnostic/useResponsiveImagesDiagnostic";
import {
  resolveParallelCandidate,
  resolveParallelSrcSet,
  resolveWarmPages,
} from "./warmCandidates";
import type { ResponsiveImagesProps } from "./types";

/** One warm target: either a full responsive tuple (the browser resolves the
 * candidate) or a single pre-resolved URL (the parallel-set heuristic). */
interface WarmTarget {
  key: string;
  src: string;
  srcSet?: string;
  sizes?: string;
  /** Only current-orientation neighbours are decode-eligible; the parallel
   * crop is a network-only hint for a rotation that may never happen. */
  isDecodeEligible: boolean;
}

interface WarmEntry {
  image: HTMLImageElement;
  isDecoded: boolean;
}

const scheduleIdle = (work: () => void): (() => void) => {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(() => work(), { timeout: 1000 });
    return () => cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(work, 150);
  return () => window.clearTimeout(handle);
};

/**
 * The responsive-image module — a HEADLESS slot (renders nothing). Its
 * PRESENCE switches the carousel's responsive stack on (art-directed
 * `<source>`s, `srcSet`/`sizes`, the rotation veil, the portrait aspect
 * flip — see `resolveRenderedImageSrc` and the root's
 * `data-responsive-images`); its BODY is the warm manager.
 *
 * ONE transport for every warm: a detached `Image` (`fetchPriority: "low"`;
 * `srcset`/`sizes` set, so the BROWSER resolves the candidate exactly like
 * the rendered markup would — no guessing). No `<link rel=preload>`: the
 * link path cannot decode and spams "preloaded but not used" warnings for
 * ahead-of-time warming by its very nature.
 *
 * What is warmed, while the deck is idle:
 * - `preloadPagesNr` neighbour pages per side, CURRENT orientation. With
 *   `isPredecodeOn` these are also `decode()`d one per idle callback, so the
 *   incoming page's bitmap is ready BEFORE a ride starts — the mid-ride
 *   decode/raster spike that can hold one frame on a weak GPU never happens.
 *   Warm refs are pruned to the current window (bounded memory) and the
 *   decode queue stops whenever the deck moves;
 * - with `isParallelSetPreloadOn`: the CURRENT page's parallel-orientation
 *   crops, network-only — so a rotation swaps the visible slides instantly;
 *   after it the new orientation is current and neighbour warming continues
 *   from there (warming neighbours of an orientation the user may never
 *   enter would double the traffic for nothing). The candidate is picked
 *   heuristically (a `media`-gated source can never be resolved by the
 *   browser ahead of time) — a miss is masked by the rotation veil.
 *
 * The host's data-saver signal is ALWAYS respected — a reduced-data user
 * gets zero warm traffic, and there is deliberately no override: the user's
 * preference outranks any product opinion.
 *
 * Unmounted, none of this exists: one native set everywhere (largest
 * candidate), no responsive markup, no warming — and this module's code is
 * tree-shaken out of the bundle.
 */
const ResponsiveImagesBase = memo(function ResponsiveImages({
  isPreloadOn = true,
  preloadPagesNr = 1,
  isParallelSetPreloadOn = false,
  isPredecodeOn = false,
}: ResponsiveImagesProps) {
  const { layout, slides, imageSizes } = useCarouselStable();
  const { status, intent } = useCarouselMotion();
  const isPortrait = useMediaQuery(SLIDE_PORTRAIT_MEDIA_CONDITION);

  useResponsiveImagesDiagnostic({ preloadPagesNr, isPreloadOn, isPredecodeOn });

  // key -> live warm entry. The ref IS the dedupe, the retention anchor for
  // a decoded bitmap, and the guarantee an in-flight fetch is not GC-aborted;
  // pruning an entry frees the bitmap and re-arms the key for a revisit.
  const warmRef = useRef(new Map<string, WarmEntry>());

  useEffect(() => {
    if (!isPreloadOn) return;
    if (layout.isDataSaverEnabled) return;
    if (!status.isIdle) return; // warm only while the deck rests
    if (slides.length === 0) return;

    const pages = resolveWarmPages(
      intent.targetPageIndex,
      layout.pageCount,
      preloadPagesNr,
      layout.isFinite,
    );

    const targetPx =
      Math.round(Number.parseFloat(imageSizes) || 0) *
      (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);

    const targets: WarmTarget[] = [];

    // Neighbour pages, current orientation — the swipe-ahead warm.
    for (const page of pages) {
      const start = page * layout.visibleSlidesCount;
      for (const slide of slides.slice(start, start + layout.visibleSlidesCount)) {
        targets.push({
          key: slide.src,
          src: slide.src,
          srcSet: slide.srcSet,
          sizes: slide.srcSet ? slide.sizes ?? imageSizes : undefined,
          isDecodeEligible: true,
        });
      }
    }

    // CURRENT page, parallel orientation — the rotation warm (network-only).
    if (isParallelSetPreloadOn) {
      const start = intent.targetPageIndex * layout.visibleSlidesCount;
      for (const slide of slides.slice(start, start + layout.visibleSlidesCount)) {
        const parallel = resolveParallelCandidate(
          resolveParallelSrcSet(slide, isPortrait, SLIDE_PORTRAIT_MEDIA_CONDITION),
          targetPx,
        );
        if (parallel !== null) {
          targets.push({
            key: parallel,
            src: parallel,
            isDecodeEligible: false,
          });
        }
      }
    }

    // Prune refs that left the warm window: frees their bitmaps and re-arms
    // the keys for a future revisit.
    const warm = warmRef.current;
    const windowKeys = new Set(targets.map((target) => target.key));
    for (const key of warm.keys()) {
      if (!windowKeys.has(key)) warm.delete(key);
    }

    // Fetches start immediately (the browser schedules low-priority loads
    // itself, exactly as it did for preload links)…
    for (const target of targets) {
      if (warm.has(target.key)) continue;
      const image = new Image();
      image.fetchPriority = "low";
      if (target.srcSet) {
        image.sizes = target.sizes ?? "";
        image.srcset = target.srcSet;
      }
      image.src = target.src;
      warm.set(target.key, { image, isDecoded: false });
    }

    // …while decodes go strictly one per idle slot — never in parallel,
    // never during a ride (the effect only runs while idle, and the cleanup
    // stops the chain the moment the deck starts moving).
    if (!isPredecodeOn) return;

    const queue = targets.filter(
      (target) => target.isDecodeEligible && warm.get(target.key)?.isDecoded === false,
    );
    let cancelIdle: (() => void) | null = null;
    let isStopped = false;

    const pump = () => {
      cancelIdle = null;
      const target = queue.shift();
      if (!target || isStopped) return;
      const entry = warm.get(target.key);
      if (!entry) {
        pump();
        return;
      }
      entry.isDecoded = true;
      entry.image
        .decode()
        .catch(() => {
          // Decode failures (broken image, eviction race) are non-events:
          // the slide's own error path owns retries; drop the ref so a
          // later idle pass may try again.
          warm.delete(target.key);
        })
        .finally(() => {
          if (!isStopped && queue.length > 0) cancelIdle = scheduleIdle(pump);
        });
    };

    if (queue.length > 0) cancelIdle = scheduleIdle(pump);

    return () => {
      isStopped = true;
      cancelIdle?.();
    };
  }, [
    imageSizes,
    intent.targetPageIndex,
    isParallelSetPreloadOn,
    isPortrait,
    isPredecodeOn,
    isPreloadOn,
    layout.isDataSaverEnabled,
    layout.isFinite,
    layout.pageCount,
    layout.visibleSlidesCount,
    preloadPagesNr,
    slides,
    status.isIdle,
  ]);

  return null;
});

export const ResponsiveImages: CarouselSlotComponent<
  typeof ResponsiveImagesBase,
  "responsive-images"
> = Object.assign(ResponsiveImagesBase, { slot: "responsive-images" as const });
