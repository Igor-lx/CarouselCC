import type { PointerSwipeDirection } from "../../../../shared";
import { clamp, normalizePageIndex } from "./math";
import { alignedVirtualIndex, nearestPageIndex, pageStart } from "./layout";
import type { CarouselLayout } from "./types";

interface ResolveDragReleaseInput {
  direction: PointerSwipeDirection;
  releasePosition: number;
  dragOriginPageIndex: number;
  /**
   * True when this drag GRABBED an in-flight ride (its anchor page is the
   * interrupted ride's destination), false for a drag that started from rest.
   *
   * A directionless release resolves differently for the two. From rest,
   * geometry decides: snap to the page nearest the released position. But an
   * interrupted ride's progress was produced by the RIDE, not by the finger —
   * judging it by geometry re-litigates a navigation that was already
   * committed, and a grab at 30% would throw the ride away and hide the slide
   * that was entering. A grab that expressed no direction of its own lets the
   * committed navigation finish: the target stays the anchor.
   */
  isInFlightGrab: boolean;
  layout: CarouselLayout;
}

export interface DragReleaseTarget {
  targetPageIndex: number;
  targetVirtualIndex: number;
  isSnap: boolean;
}

/**
 * Decide the page target after a drag release.
 * - direction "left"/"right": commit by ±1 page from origin if possible;
 *   otherwise snap back to origin.
 * - direction "none" from rest: snap to the page nearest the visual release
 *   position.
 * - direction "none" on an in-flight grab: finish the interrupted ride — the
 *   anchor (its destination) stays the target (see `isInFlightGrab`).
 *
 * The returned `isSnap` flag is `true` when the result is a passive snap
 * (no real navigation), which the runner uses to pick a snap-back curve.
 */
export const resolveDragRelease = ({
  direction,
  releasePosition,
  dragOriginPageIndex,
  isInFlightGrab,
  layout,
}: ResolveDragReleaseInput): DragReleaseTarget => {
  const snapTarget = isInFlightGrab
    ? dragOriginPageIndex
    : nearestPageIndex(releasePosition, layout);
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
