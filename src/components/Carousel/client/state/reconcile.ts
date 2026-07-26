import {
  pageStart,
  reconciledPageIndex,
  type CarouselLayout,
} from "../domain";
import { buildInitialState } from "./initial";
import { ZERO_GESTURE_RELEASE, type CarouselState } from "./types";

// `dataKey` pins `length` and, with `visibleSlidesCount`, fully determines
// `canSlide` and `virtualLength` — so these four fields are a complete
// layout-equivalence check.
const sameLayout = (a: CarouselLayout, b: CarouselLayout) =>
  a.dataKey === b.dataKey &&
  a.visibleSlidesCount === b.visibleSlidesCount &&
  a.isFinite === b.isFinite &&
  a.pageCount === b.pageCount;

/**
 * Brings a previous state into a new layout. Same shape: state is unchanged
 * (bar a swapped layout reference). Otherwise page indexes are mapped
 * proportionally, virtual indexes reset to the page start, and motion collapses
 * to an instant snap so the visual catches up cleanly.
 */
export const reconcileStateToLayout = (
  state: CarouselState,
  nextLayout: CarouselLayout,
): CarouselState => {
  const currentLayout = state.layout;

  if (sameLayout(currentLayout, nextLayout)) {
    return currentLayout === nextLayout
      ? state
      : { ...state, layout: nextLayout };
  }

  const hardReset =
    nextLayout.dataKey !== currentLayout.dataKey ||
    nextLayout.isFinite !== currentLayout.isFinite;

  if (hardReset) return buildInitialState(nextLayout);

  const targetPageIndex = reconciledPageIndex(
    state.targetPageIndex,
    currentLayout,
    nextLayout,
  );
  const virtualIndex = pageStart(targetPageIndex, nextLayout.visibleSlidesCount);

  return {
    ...state,
    layout: nextLayout,
    targetPageIndex,
    fromVirtualIndex: virtualIndex,
    virtualIndex,
    teleportVirtualIndex: null,
    isTeleportApproach: false,
    isRepeatedClickAdvance: false,
    motionPhase: "step-instant",
    gesture: ZERO_GESTURE_RELEASE,
  };
};
