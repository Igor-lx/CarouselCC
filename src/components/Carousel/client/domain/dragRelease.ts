import type { PointerSwipeDirection } from "../../../../shared";
import { clamp, normalizePageIndex } from "./math";
import { alignedVirtualIndex, nearestPageIndex, pageStart } from "./layout";
import type { CarouselLayout } from "./types";

/** Float-noise absorber for the release position compare — an implementation
 * constant, not a feel knob, so it lives here rather than in config/. */
export const DRAG_RELEASE_EPSILON = 0.001;

interface ResolveDragReleaseInput {
  direction: PointerSwipeDirection;
  releasePosition: number;
  dragOriginPageIndex: number;
  /**
   * True when this drag GRABBED an in-flight ride. A directionless release
   * then settles by the interrupted ride's intent, not by geometry — judging
   * a ride-produced position geometrically would discard a committed
   * navigation and hide the entering slide.
   */
  isInFlightGrab: boolean;
  /**
   * The page whose slide the finger LANDED on, `null` when unmeasurable. A
   * directionless release on a braked strip settles onto the PRESSED page,
   * falling back to the anchor (the interrupted ride's destination).
   */
  pressedPageIndex: number | null;
  layout: CarouselLayout;
}

export interface DragReleaseTarget {
  targetPageIndex: number;
  targetVirtualIndex: number;
  isSnap: boolean;
}

/**
 * Decide the page target after a drag release.
 * - "left"/"right": commit ±1 page from origin, else snap back to origin.
 * - "none" from rest: snap to the page nearest the release position.
 * - "none" on an in-flight grab: settle onto the pressed page (see input docs).
 *
 * `isSnap` is `true` for a passive snap (no real navigation); the runner uses
 * it to pick a snap-back curve.
 */
export const resolveDragRelease = ({
  direction,
  releasePosition,
  dragOriginPageIndex,
  isInFlightGrab,
  pressedPageIndex,
  layout,
}: ResolveDragReleaseInput): DragReleaseTarget => {
  const snapTarget = isInFlightGrab
    ? pressedPageIndex ?? dragOriginPageIndex
    : nearestPageIndex(releasePosition, layout);
  let targetPageIndex = snapTarget;
  // An in-flight settle is a REAL navigation from a braked strip — it rides
  // the normal step curve, not the quick snap-back.
  let isSnap = !isInFlightGrab;

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
