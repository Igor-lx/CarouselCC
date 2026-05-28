import type { CarouselStatusSnapshot } from "../contract/types";

export const areStatusSnapshotsEqual = (
  a: CarouselStatusSnapshot,
  b: CarouselStatusSnapshot,
): boolean =>
  a.isIdle === b.isIdle &&
  a.currentPageIndex === b.currentPageIndex &&
  a.pageCount === b.pageCount &&
  a.isAtStart === b.isAtStart &&
  a.isAtEnd === b.isAtEnd;
