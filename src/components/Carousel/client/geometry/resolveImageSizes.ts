// See docs/architecture/geometry.md
// A plain function, deliberately not a hook: it reads the already-published
// slot and holds no state of its own.

interface ResolveImageSizesInput {
  /** The published slot px from the carousel's one measurement source. */
  slotPx: number | null;
  visibleSlidesCount: number;
}

/** The images' `sizes` as a measured pixel length, `vw`-fraction before measure. */
export function resolveImageSizes({
  slotPx,
  visibleSlidesCount,
}: ResolveImageSizesInput): string {
  return slotPx !== null
    ? `${slotPx}px`
    : `${Math.ceil(100 / Math.max(1, visibleSlidesCount))}vw`;
}
