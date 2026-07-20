import { memo, useEffect, useRef } from "react";

import { useSlideViewport } from "../../viewport/useSlideViewport";
import { useCarouselMotion, useCarouselStable } from "../../context";
import type { CarouselSlotComponent } from "../../slots";
import { useResponsiveImagesDiagnostic } from "../Diagnostic/useResponsiveImagesDiagnostic";
import { resolveRenderedSrcSet, resolveWarmPages } from "./warmCandidates";
import type { ResponsiveImagesProps } from "./types";

/** One warm target. `srcSet` is the set the rendered `<picture>` would choose
 * for THIS viewport (see `resolveRenderedSrcSet`); the browser then resolves
 * the concrete candidate from it exactly as the markup would, so the warm can
 * never fetch an asset the deck will not use. `src` is the plain fallback for
 * a slide that carries no set at all. */
interface WarmTarget {
  key: string;
  src?: string;
  srcSet?: string;
  sizes?: string;
}

interface WarmEntry {
  /** Held only until the fetch/decode completes, then released: pinning
   * decoded bitmaps for the whole warm window measurably squeezed the GPU
   * raster budget on weak devices (more checkerboard frames at the
   * post-settle window shift). The browser's own decode cache keeps the
   * warm useful; the entry itself stays as the dedupe record. */
  image: HTMLImageElement | null;
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
 * What is warmed, while the deck is idle: `preloadPagesNr` neighbour pages
 * per side, in the CURRENT orientation — the swipe-ahead warm. With
 * `isPredecodeOn` these are also `decode()`d one per idle callback, so the
 * incoming page's bitmap is ready BEFORE a ride starts and the mid-ride
 * decode/raster spike that can hold one frame on a weak GPU never happens.
 * Warm refs are pruned to the current window (bounded memory) and the decode
 * queue stops whenever the deck moves.
 *
 * There is deliberately NO speculative warm of the parallel orientation's
 * crops. It could never be correct: how many slides the OTHER orientation
 * shows is the host's own responsive policy (`visibleSlidesNr` is a prop this
 * component receives already resolved for the CURRENT viewport), so the set
 * to warm is unknowable here — and it cost a full extra crop per slide for a
 * rotation most users never perform. The rotation veil already guarantees a
 * correct swap (`useOrientationSwapVeil`); it just fades a little longer on a
 * cold crop.
 *
 * The host's data-saver signal is ALWAYS respected — a reduced-data user
 * gets zero warm traffic, and there is deliberately no override: the user's
 * preference outranks any product opinion.
 *
 * Unmounted, none of this exists: one native set everywhere (the designated
 * `defaultSrc`), no responsive markup, no warming — and this module's code is
 * tree-shaken out of the bundle.
 */
const ResponsiveImagesBase = memo(function ResponsiveImages({
  isPreloadOn = true,
  preloadPagesNr = 1,
  isPredecodeOn = false,
}: ResponsiveImagesProps) {
  const { layout, slides, imageSizes } = useCarouselStable();
  const { status, intent } = useCarouselMotion();
  // The art-direction verdicts: which <source media> conditions the viewport
  // matches right now. Any flip changes `signature`, and the warm re-runs
  // for the newly-selected crops.
  const { matches: matchesMedia, signature: mediaSignature } =
    useSlideViewport();

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

    const targets: WarmTarget[] = [];
    for (const page of pages) {
      const start = page * layout.visibleSlidesCount;
      for (const slide of slides.slice(start, start + layout.visibleSlidesCount)) {
        // The crop the deck is ACTUALLY rendering for this viewport — never
        // the default set blindly (that would fetch the default family while
        // the deck shows the art-directed crop).
        const { srcSet, sizes } = resolveRenderedSrcSet(slide, matchesMedia);
        targets.push({
          // The chosen set is part of the identity: a rotation picks another
          // crop for the same slide, and that crop must warm on its own.
          key: srcSet ? `${slide.src}|${srcSet}` : slide.src,
          src: srcSet ? undefined : slide.src,
          srcSet,
          sizes: srcSet ? sizes ?? imageSizes : undefined,
        });
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
        // srcset ALONE: setting `src` too would offer the browser the default
        // (landscape) candidate alongside the art-directed set we chose.
        image.sizes = target.sizes ?? "";
        image.srcset = target.srcSet;
      } else if (target.src) {
        image.src = target.src;
      }
      const entry: WarmEntry = { image, isDecoded: false };
      warm.set(target.key, entry);
      if (!isPredecodeOn) {
        // Network-only warm: release the ref once the bytes are in —
        // holding it would pin nothing useful (no decode was requested).
        image.addEventListener("load", () => {
          entry.image = null;
        });
        image.addEventListener("error", () => {
          warm.delete(target.key);
        });
      }
    }

    // …while decodes go strictly one per idle slot — never in parallel,
    // never during a ride (the effect only runs while idle, and the cleanup
    // stops the chain the moment the deck starts moving).
    if (!isPredecodeOn) return;

    const queue = targets.filter(
      (target) => warm.get(target.key)?.isDecoded === false,
    );
    let cancelIdle: (() => void) | null = null;
    let isStopped = false;

    const pump = () => {
      cancelIdle = null;
      const target = queue.shift();
      if (!target || isStopped) return;
      const entry = warm.get(target.key);
      if (!entry || entry.image === null) {
        pump();
        return;
      }
      entry.isDecoded = true;
      entry.image
        .decode()
        .then(() => {
          // Decoded into the browser's cache — release the ref instead of
          // pinning the bitmap: a window of pinned decodes squeezed the GPU
          // raster budget on weak devices.
          entry.image = null;
        })
        .catch(() => {
          // Decode failures (broken image, eviction race) are non-events:
          // the slide's own error path owns retries; drop the record so a
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
    matchesMedia,
    mediaSignature,
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
