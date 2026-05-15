import {
  pageStart,
  reconciledPageIndex,
  type CarouselLayout,
} from "../domain";
import { buildInitialState } from "./initial";
import { ZERO_GESTURE_RELEASE, type CarouselState } from "./types";

const sameLayout = (a: CarouselLayout, b: CarouselLayout) =>
  a.dataKey === b.dataKey &&
  a.totalVirtual === b.totalVirtual &&
  a.visibleSlidesCount === b.visibleSlidesCount &&
  a.isFinite === b.isFinite &&
  a.pageCount === b.pageCount;

/**
 * Brings a previous state into a new layout. If the layout is the same
 * shape, the state is unchanged (or carries over with a swapped layout
 * reference). Otherwise the page indexes are mapped proportionally and the
 * virtual indexes reset to the page start; the motion is collapsed to an
 * instant snap so the visual catches up cleanly.
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

  const activePageIndex = reconciledPageIndex(
    state.activePageIndex,
    currentLayout,
    nextLayout,
  );
  const targetPageIndex = reconciledPageIndex(
    state.targetPageIndex,
    currentLayout,
    nextLayout,
  );
  const virtualIndex = pageStart(targetPageIndex, nextLayout.visibleSlidesCount);

  return {
    ...state,
    layout: nextLayout,
    activePageIndex,
    targetPageIndex,
    fromVirtualIndex: virtualIndex,
    virtualIndex,
    isRepeatedClickAdvance: false,
    motionPhase: "step-instant",
    gesture: ZERO_GESTURE_RELEASE,
  };
};
