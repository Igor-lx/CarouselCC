import { useEffect, useRef } from "react";

import type { CarouselStatusSnapshot } from "../public-api/types";
import { areStatusSnapshotsEqual } from "./statusSnapshot";

interface UseCarouselStatusReporterInput {
  onCarouselStatusChange: ((snapshot: CarouselStatusSnapshot) => void) | undefined;
  isIdle: boolean;
  targetPageIndex: number;
  pageCount: number;
  isAtStart: boolean;
  isAtEnd: boolean;
}

/**
 * Owns the read-only, low-frequency status reported to the host. Fires on
 * mount and whenever the idle flag, target page, page count, or a boundary
 * flag changes — never on a per-frame motion sample; identical consecutive
 * snapshots are deduplicated. The TARGET page (not the settled page) is
 * reported, so the snapshot reflects intent immediately on click/gesture.
 */
export function useCarouselStatusReporter({
  onCarouselStatusChange,
  isIdle,
  targetPageIndex,
  pageCount,
  isAtStart,
  isAtEnd,
}: UseCarouselStatusReporterInput): void {
  const lastSnapshotRef = useRef<CarouselStatusSnapshot | null>(null);

  useEffect(() => {
    if (!onCarouselStatusChange) return;
    const snapshot: CarouselStatusSnapshot = {
      isIdle,
      currentPageIndex: targetPageIndex,
      pageCount,
      isAtStart,
      isAtEnd,
    };
    const previous = lastSnapshotRef.current;
    if (previous && areStatusSnapshotsEqual(previous, snapshot)) return;
    lastSnapshotRef.current = snapshot;
    onCarouselStatusChange(snapshot);
  }, [onCarouselStatusChange, isIdle, targetPageIndex, pageCount, isAtStart, isAtEnd]);
}
