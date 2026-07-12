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

/**
 * The responsive-image module — a HEADLESS slot (renders nothing). Its
 * PRESENCE switches the carousel's responsive stack on (art-directed
 * `<source>`s, `srcSet`/`sizes`, the rotation veil, the portrait aspect
 * flip — see `resolveRenderedImageSrc` and the root's
 * `data-responsive-images`); its BODY is the preload manager:
 *
 * - neighbour pages of the current target are warmed while the deck is idle,
 *   through React 19's `preload()` with `imageSrcSet`/`imageSizes` — the
 *   BROWSER picks the exact candidate, no guessing;
 * - optionally (`isParallelSetPreloadOn`) the parallel orientation's crop is
 *   warmed too, so the first device rotation swaps instantly; here a
 *   candidate must be picked heuristically (a `media`-gated source can never
 *   preload natively) — a miss is masked by the rotation veil;
 * - the host's data-saver signal is ALWAYS respected — a reduced-data user
 *   gets zero warm traffic, and there is deliberately no override: the
 *   user's preference outranks any product opinion.
 *
 * Unmounted, none of this exists: one native set everywhere (largest
 * candidate), no responsive markup, no preload — and this module's code is
 * tree-shaken out of the bundle.
 */
const ResponsiveImagesBase = memo(function ResponsiveImages({
  isPreloadOn = true,
  preloadPagesNr = 1,
  isParallelSetPreloadOn = false,
}: ResponsiveImagesProps) {
  const { layout, slides, imageSizes } = useCarouselStable();
  const { status, intent } = useCarouselMotion();
  const isPortrait = useMediaQuery(SLIDE_PORTRAIT_MEDIA_CONDITION);

  useResponsiveImagesDiagnostic({ preloadPagesNr });

  // preload() deduplicates by href internally; this set just keeps the
  // effect from re-issuing calls on every idle re-entry.
  const warmedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!isPreloadOn) return;
    if (layout.isDataSaverEnabled) return;
    if (!status.isIdle) return; // warm only while the deck rests
    if (slides.length === 0) return;

    const warmed = warmedRef.current;
    const pages = resolveWarmPages(
      intent.targetPageIndex,
      layout.pageCount,
      preloadPagesNr,
      layout.isFinite,
    );

    const targetPx =
      Math.round(Number.parseFloat(imageSizes) || 0) *
      (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);

    for (const page of pages) {
      const start = page * layout.visibleSlidesCount;
      for (const slide of slides.slice(start, start + layout.visibleSlidesCount)) {
        // Current orientation: the browser resolves the candidate itself.
        if (!warmed.has(slide.src)) {
          warmed.add(slide.src);
          preload(slide.src, {
            as: "image",
            fetchPriority: "low",
            imageSrcSet: slide.srcSet,
            imageSizes: slide.srcSet ? slide.sizes ?? imageSizes : undefined,
          });
        }

        if (!isParallelSetPreloadOn) continue;
        const parallel = resolveParallelCandidate(
          resolveParallelSrcSet(slide, isPortrait, SLIDE_PORTRAIT_MEDIA_CONDITION),
          targetPx,
        );
        if (parallel !== null && !warmed.has(parallel)) {
          warmed.add(parallel);
          preload(parallel, { as: "image", fetchPriority: "low" });
        }
      }
    }
  }, [
    imageSizes,
    intent.targetPageIndex,
    isParallelSetPreloadOn,
    isPortrait,
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
