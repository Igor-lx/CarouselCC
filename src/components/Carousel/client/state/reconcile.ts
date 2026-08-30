// See docs/architecture/state.md + docs/adr/0001-layout-reconciliation.md
import { pageStart, reconciledPageIndex, type CarouselLayout } from "../domain";
import { buildInitialState } from "./initial";
import { ZERO_GESTURE_RELEASE, type CarouselState } from "./types";

// These four fields are a complete layout-equivalence check (dataKey pins the rest).
const sameLayout = (a: CarouselLayout, b: CarouselLayout) =>
  a.dataKey === b.dataKey &&
  a.visibleSlidesCount === b.visibleSlidesCount &&
  a.isFinite === b.isFinite &&
  a.pageCount === b.pageCount;

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
