// See docs/architecture/host-report.md
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
