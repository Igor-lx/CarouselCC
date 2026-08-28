// See docs/architecture/domain.md
import type { PointerSwipeDirection } from "../../../../shared";
import { clamp, normalizePageIndex } from "./math";
import { alignedVirtualIndex, nearestPageIndex, pageStart } from "./layout";
import type { CarouselLayout } from "./types";

/** Float-noise absorber for the release compare — implementation constant, not a knob. */
export const DRAG_RELEASE_EPSILON = 0.001;

interface ResolveDragReleaseInput {
  direction: PointerSwipeDirection;
  releasePosition: number;
  dragOriginPageIndex: number;
  /** This drag grabbed an in-flight ride — a directionless release settles by
   * intent, not geometry (see doc). */
  isInFlightGrab: boolean;
  /** Page the finger landed on, `null` when unmeasurable. */
  pressedPageIndex: number | null;
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
  isInFlightGrab,
  pressedPageIndex,
  layout,
}: ResolveDragReleaseInput): DragReleaseTarget => {
  const snapTarget = isInFlightGrab
    ? (pressedPageIndex ?? dragOriginPageIndex)
    : nearestPageIndex(releasePosition, layout);
  let targetPageIndex = snapTarget;
  let isSnap = !isInFlightGrab; // in-flight settle is a real nav, not a snap-back

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
