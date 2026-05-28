import type { PointerSwipeDirection } from "../../../shared";
import { clamp, normalizePageIndex } from "./math";
import { alignedVirtualIndex, nearestPageIndex, pageStart } from "./layout";
import type { CarouselLayout } from "./types";

interface ResolveDragReleaseInput {
  direction: PointerSwipeDirection;
  releasePosition: number;
  dragOriginPageIndex: number;
  layout: CarouselLayout;
}

export interface DragReleaseTarget {
  targetPageIndex: number;
  targetVirtualIndex: number;
  isSnap: boolean;
}

export const resolveDragRelease = ({
  direction,
  releasePosition,
  dragOriginPageIndex,
  layout,
}: ResolveDragReleaseInput): DragReleaseTarget => {
  const snapTarget = nearestPageIndex(releasePosition, layout);
  let targetPageIndex = snapTarget;
  let isSnap = true;

  if (direction === "left") {
    targetPageIndex = layout.isFinite
      ? clamp(dragOriginPageIndex + 1, 0, layout.pageCount - 1)
      : normalizePageIndex(dragOriginPageIndex + 1, layout.pageCount);
    isSnap = targetPageIndex === dragOriginPageIndex;
  } else if (direction === "right") {
    targetPageIndex = layout.isFinite
      ? clamp(dragOriginPageIndex - 1, 0, layout.pageCount - 1)
      : normalizePageIndex(dragOriginPageIndex - 1, layout.pageCount);
    isSnap = targetPageIndex === dragOriginPageIndex;
  }

  const targetVirtualIndex = layout.isFinite
    ? pageStart(targetPageIndex, layout.visibleSlidesCount)
    : alignedVirtualIndex(targetPageIndex, releasePosition, layout);

  return { targetPageIndex, targetVirtualIndex, isSnap };
};
