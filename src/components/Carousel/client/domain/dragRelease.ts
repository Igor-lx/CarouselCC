import type { PointerSwipeDirection } from "../../../../shared";
import { clamp, normalizePageIndex } from "./math";
import { alignedVirtualIndex, nearestPageIndex, pageStart } from "./layout";
import type { CarouselLayout } from "./types";

/**
 * Tolerance for "the drag released already on target" snap detection. An
 * IMPLEMENTATION constant (float-noise absorber for the position compare
 * below), not a feel knob — hence colocated with the release resolution it
 * guards rather than living in config/.
 */
export const DRAG_RELEASE_EPSILON = 0.001;

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
   * that was entering.
   */
  isInFlightGrab: boolean;
  /**
   * The page whose slide the finger LANDED on (press-point hit), `null` when
   * unmeasurable. The catch-and-hold contract: pressing a moving strip brakes
   * it, and a release that expressed no direction of its own settles onto the
   * PRESSED page — the slide in front of the eyes, the one a long-press menu
   * describes — riding the normal step curve (`isSnap: false`), like a button
   * press. Falls back to the anchor (the interrupted ride's destination).
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
 * - direction "left"/"right": commit by ±1 page from origin if possible;
 *   otherwise snap back to origin.
 * - direction "none" from rest: snap to the page nearest the visual release
 *   position (quick snap-back curve).
 * - direction "none" on an in-flight grab: settle onto the PRESSED page
 *   (`pressedPageIndex`, falling back to the anchor), riding the normal step
 *   curve — a press braked the strip, and a hold that expressed no direction
 *   lands on what the finger pressed (see the input docs).
 *
 * The returned `isSnap` flag is `true` when the result is a passive snap
 * (no real navigation), which the runner uses to pick a snap-back curve.
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
