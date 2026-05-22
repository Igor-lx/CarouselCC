import type { CarouselStatusSnapshot } from "../types";

/**
 * Shallow equality of two status snapshots. The `onCarouselStatusChange`
 * callback fires only when this returns `false`, so a status that did not
 * change never reaches the host.
 */
export const areStatusSnapshotsEqual = (
  a: CarouselStatusSnapshot,
  b: CarouselStatusSnapshot,
): boolean =>
  a.isIdle === b.isIdle &&
  a.currentPageIndex === b.currentPageIndex &&
  a.pageCount === b.pageCount;
