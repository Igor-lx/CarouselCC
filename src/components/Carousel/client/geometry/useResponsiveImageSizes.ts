import { useState, type RefObject } from "react";

import { measureSlotSize } from "../domain";
import { useIsomorphicLayoutEffect } from "../../../../shared";

const SIZE_EPSILON_PX = 1;

interface UseResponsiveImageSizesInput {
  viewportRef: RefObject<HTMLElement | null>;
  visibleSlidesCount: number;
}

/**
 * The `sizes` attribute for the responsive slide images, derived from the
 * carousel's *measured* slot width rather than a `vw` formula.
 *
 * Why measured, not computed: the slot is not a clean fraction of the viewport.
 * The viewport is capped (`min(100%, 760px)`), padded, and gapped, so a
 * `${100 / visibleSlidesCount}vw` hint overstates the real slot and biases the
 * browser toward an oversized candidate — which on a high-DPR phone means
 * fetching and rasterizing a needlessly large tile. Measuring the live slot is
 * the single source of truth (the DOM/CSS itself); a JS formula that re-derived
 * the CSS caps would be a second, drift-prone source.
 *
 * The value is a concrete pixel length (`"<slot>px"`). Combined with the
 * candidate `srcSet`, the browser then multiplies by DPR and picks the smallest
 * candidate that covers the *actual* slot — never a larger one because the hint
 * was inflated.
 *
 * Cadence: this is a low-frequency string, not per-frame work. It is recomputed
 * only when the slot actually changes (mount, viewport resize, slide-count
 * change), and re-renders only when the rounded pixel value moves — so it never
 * touches the motion hot path. Reuses the same `measureSlotSize` primitive and
 * the same viewport element the track binding measures, so there is one
 * measurement definition, not two.
 */
export function useResponsiveImageSizes({
  viewportRef,
  visibleSlidesCount,
}: UseResponsiveImageSizesInput): string {
  const [slotPx, setSlotPx] = useState<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof window === "undefined") return;

    const remeasure = () => {
      const slot = measureSlotSize(viewport, visibleSlidesCount);
      if (!(slot > 0)) return;
      setSlotPx((previous) =>
        previous !== null && Math.abs(previous - slot) < SIZE_EPSILON_PX
          ? previous
          : Math.round(slot),
      );
    };

    remeasure();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(remeasure);
      observer.observe(viewport);
    }
    window.addEventListener("resize", remeasure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", remeasure);
    };
  }, [viewportRef, visibleSlidesCount]);

  // Before the first measurement (SSR / first paint) fall back to the slot's
  // nominal viewport fraction, so the markup always carries a usable `sizes`.
  return slotPx !== null
    ? `${slotPx}px`
    : `${Math.ceil(100 / Math.max(1, visibleSlidesCount))}vw`;
}
