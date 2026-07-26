// See docs/architecture/host-report.md
import type { CarouselStatusSnapshot } from "../public-api/types";

/** Shallow equality of two status snapshots (drives host-callback dedup). */
export const areStatusSnapshotsEqual = (
  a: CarouselStatusSnapshot,
  b: CarouselStatusSnapshot,
): boolean =>
  a.isIdle === b.isIdle &&
  a.currentPageIndex === b.currentPageIndex &&
  a.pageCount === b.pageCount &&
  a.isAtStart === b.isAtStart &&
  a.isAtEnd === b.isAtEnd;
