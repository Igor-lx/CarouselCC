import type { RefObject } from "react";

import { useMeasuredSlotSize } from "./useMeasuredSlotSize";

interface UseResponsiveImageSizesInput {
  viewportRef: RefObject<HTMLElement | null>;
  visibleSlidesCount: number;
}

/**
 * The `sizes` attribute for the responsive slide images, derived from the
 * carousel's *measured* slot width (see `useMeasuredSlotSize`) rather than a
 * `vw` formula — a computed hint overstates the real (capped + padded) slot
 * and biases the browser toward an oversized candidate, which on a high-DPR
 * phone means fetching and rasterizing a needlessly large tile.
 *
 * The value is a concrete pixel length (`"<slot>px"`). Combined with the
 * candidate `srcSet`, the browser multiplies by DPR and picks the smallest
 * candidate that covers the *actual* slot — never a larger one because the
 * hint was inflated. Before the first measurement (SSR / first paint) it
 * falls back to the slot's nominal viewport fraction, so the markup always
 * carries a usable `sizes`.
 */
export function useResponsiveImageSizes({
  viewportRef,
  visibleSlidesCount,
}: UseResponsiveImageSizesInput): string {
  const slotPx = useMeasuredSlotSize({ viewportRef, visibleSlidesCount });

  return slotPx !== null
    ? `${slotPx}px`
    : `${Math.ceil(100 / Math.max(1, visibleSlidesCount))}vw`;
}
