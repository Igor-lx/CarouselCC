import { memo, useEffect, useRef } from "react";
import { preload } from "react-dom";

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
 * `data-responsive-images`); its BODY is the warm manager:
 *
 * - neighbour pages of the current target are warmed while the deck is idle.
 *   Network-only warm (`isPredecodeOn` off) goes through React 19's
 *   `preload()` with `imageSrcSet`/`imageSizes` — the BROWSER picks the
 *   exact candidate, no guessing;
 * - `isPredecodeOn` upgrades the warm to network + DECODE: candidates load
 *   through detached `Image`s (same browser-side candidate resolution via
 *   `srcset`/`sizes`) and are `decode()`d one at a time in idle callbacks,
 *   so the incoming page's bitmap is ready BEFORE a ride starts — the
 *   mid-ride decode/raster spike that can hold a frame on a weak GPU never
 *   happens. Decoded refs are pruned to the current warm window, and the
 *   queue stops while the deck moves (warming never competes with a ride);
 * - optionally (`isParallelSetPreloadOn`) the parallel orientation's crop is
 *   warmed too, so the first device rotation swaps instantly; here a
 *   candidate must be picked heuristically (a `media`-gated source can never
 *   preload natively) — a miss is masked by the rotation veil;
 * - the host's data-saver signal is ALWAYS respected — a reduced-data user
 *   gets zero warm traffic, and there is deliberately no override: the
 *   user's preference outranks any product opinion.
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

  useResponsiveImagesDiagnostic({ preloadPagesNr });

  // preload() deduplicates by href internally; this set just keeps the
  // effect from re-issuing calls on every idle re-entry.
  const warmedRef = useRef(new Set<string>());
  // Predecode mode: key -> decoded Image. The live ref IS both the dedupe
  // and the thing that keeps the decoded bitmap cache-resident; pruning an
  // entry both frees the bitmap and re-arms decoding for that key.
  const decodedRef = useRef(new Map<string, HTMLImageElement>());

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
    for (const page of pages) {
      const start = page * layout.visibleSlidesCount;
      for (const slide of slides.slice(start, start + layout.visibleSlidesCount)) {
        // Current orientation: the browser resolves the candidate itself.
        targets.push({
          key: slide.src,
          src: slide.src,
          srcSet: slide.srcSet,
          sizes: slide.srcSet ? slide.sizes ?? imageSizes : undefined,
        });

        if (!isParallelSetPreloadOn) continue;
        const parallel = resolveParallelCandidate(
          resolveParallelSrcSet(slide, isPortrait, SLIDE_PORTRAIT_MEDIA_CONDITION),
          targetPx,
        );
        if (parallel !== null) {
          targets.push({ key: parallel, src: parallel });
        }
      }
    }

    if (!isPredecodeOn) {
      const warmed = warmedRef.current;
      for (const target of targets) {
        if (warmed.has(target.key)) continue;
        warmed.add(target.key);
        preload(target.src, {
          as: "image",
          fetchPriority: "low",
          imageSrcSet: target.srcSet,
          imageSizes: target.sizes,
        });
      }
      return;
    }

    // Predecode: prune refs that left the warm window (frees their bitmaps
    // and re-arms them for a future revisit), then decode the missing ones
    // strictly one per idle slot — never in parallel, never during a ride
    // (the effect body only runs while idle, and the cleanup below stops the
    // chain the moment the deck starts moving).
    const decoded = decodedRef.current;
    const windowKeys = new Set(targets.map((target) => target.key));
    for (const key of decoded.keys()) {
      if (!windowKeys.has(key)) decoded.delete(key);
    }

    const queue = targets.filter((target) => !decoded.has(target.key));
    let cancelIdle: (() => void) | null = null;
    let isStopped = false;

    const pump = () => {
      cancelIdle = null;
      const target = queue.shift();
      if (!target || isStopped) return;
      const image = new Image();
      if (target.srcSet) {
        image.sizes = target.sizes ?? "";
        image.srcset = target.srcSet;
      }
      image.src = target.src;
      decoded.set(target.key, image);
      image
        .decode()
        .catch(() => {
          // Decode failures (broken image, eviction race) are non-events:
          // the slide's own error path owns retries; drop the ref so a
          // later idle pass may try again.
          decoded.delete(target.key);
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
