// See docs/architecture/state.md — ADR-001
import { pageStart, reconciledPageIndex, type CarouselLayout } from "../domain";
import { buildInitialState } from "./initial";
import { ZERO_GESTURE_RELEASE, type CarouselState } from "./types";

// A complete layout-equivalence check: `dataKey` pins the records, and the
// page count follows from those and the visible count, so it adds nothing.
const sameLayout = (a: CarouselLayout, b: CarouselLayout) =>
  a.dataKey === b.dataKey &&
  a.visibleSlidesCount === b.visibleSlidesCount &&
  a.isFinite === b.isFinite;

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

  if (hardReset)
    return buildInitialState(nextLayout, state.config, state.isInstantMode);

  const targetPageIndex = reconciledPageIndex(
    state.targetPageIndex,
    currentLayout,
    nextLayout,
  );
  const virtualIndex = pageStart(
    targetPageIndex,
    nextLayout.visibleSlidesCount,
  );

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
