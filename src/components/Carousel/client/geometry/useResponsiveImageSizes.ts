// See docs/architecture/geometry.md

interface UseResponsiveImageSizesInput {
  /** The published slot px from the carousel's one measurement source. */
  slotPx: number | null;
  visibleSlidesCount: number;
}

/** The images' `sizes` as a measured pixel length, `vw`-fraction before measure. */
export function useResponsiveImageSizes({
  slotPx,
  visibleSlidesCount,
}: UseResponsiveImageSizesInput): string {
  return slotPx !== null
    ? `${slotPx}px`
    : `${Math.ceil(100 / Math.max(1, visibleSlidesCount))}vw`;
}
