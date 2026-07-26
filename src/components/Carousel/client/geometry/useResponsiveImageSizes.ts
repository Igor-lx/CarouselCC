// See docs/architecture/geometry.md
import type { RefObject } from "react";

import { useMeasuredSlotSize } from "./useMeasuredSlotSize";

interface UseResponsiveImageSizesInput {
  viewportRef: RefObject<HTMLElement | null>;
  visibleSlidesCount: number;
}

/** The images' `sizes` as a measured pixel length, `vw`-fraction before measure. */
export function useResponsiveImageSizes({
  viewportRef,
  visibleSlidesCount,
}: UseResponsiveImageSizesInput): string {
  const slotPx = useMeasuredSlotSize({ viewportRef, visibleSlidesCount });

  return slotPx !== null
    ? `${slotPx}px`
    : `${Math.ceil(100 / Math.max(1, visibleSlidesCount))}vw`;
}
