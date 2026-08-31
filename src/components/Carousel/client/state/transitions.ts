// See docs/architecture/state.md
import {
  alignedVirtualIndex,
  clamp,
  normalizePageIndex,
  pageStart,
} from "../domain";
import { REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES } from "../config";
import type { MotionSettings } from "../config";
import { resolveGoToPlan } from "../motion/timing";
import type {
  CarouselState,
  GoToCommand,
  MoveCommand,
  MotionPhase,
} from "./types";

const repeatedClickStep = (step: number): number =>
  Math.sign(step) * REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES;

const stepOrigin = (
  state: CarouselState,
  fromVirtualIndex: number,
  step: number,
  isSameDirectionRepeat: boolean,
) => {
  const stepSize = state.layout.visibleSlidesCount;
  const isQueued = state.layout.canSlide && state.motionPhase !== "idle";

  let currentPageIndex: number;
  let laneReference: number;
  if (isSameDirectionRepeat) {
    const direction = Math.sign(step);
    const visualPage =
      direction > 0
        ? Math.floor(fromVirtualIndex / stepSize)
        : Math.ceil(fromVirtualIndex / stepSize);
    currentPageIndex = state.layout.isFinite
      ? clamp(visualPage, 0, state.layout.pageCount - 1)
      : normalizePageIndex(visualPage, state.layout.pageCount);
    laneReference = fromVirtualIndex;
  } else {
    currentPageIndex = state.targetPageIndex;
    laneReference = isQueued ? state.virtualIndex : fromVirtualIndex;
  }

  const currentVirtualIndex = state.layout.isFinite
    ? pageStart(currentPageIndex, stepSize)
    : alignedVirtualIndex(currentPageIndex, laneReference, state.layout);

  return { currentPageIndex, currentVirtualIndex };
};

interface StepResolution {
  nextFromVirtualIndex: number;
  nextTargetPageIndex: number;
  nextVirtualIndex: number;
  /** Far-GO_TO final position, `null` otherwise (then nextVirtualIndex is the preflight landing). */
  nextTeleportVirtualIndex: number | null;
  phase: MotionPhase;
}

interface PageTarget {
  nextTargetPageIndex: number;
  pageDelta: number;
}

/**
 * MOVE: step from the origin page. The delta is the step itself, because it is
 * read in cyclic mode only — as the lane advance. A finite MOVE derives its
 * landing from the target page start and builds no GO_TO plan, so no reader of
 * `pageDelta` exists on that path.
 */
const resolveMoveTarget = (
  layout: CarouselState["layout"],
  currentPageIndex: number,
  moveStep: number,
): PageTarget => {
  const raw = currentPageIndex + moveStep;
  return {
    nextTargetPageIndex: layout.isFinite
      ? clamp(raw, 0, layout.pageCount - 1)
      : normalizePageIndex(raw, layout.pageCount),
    pageDelta: moveStep,
  };
};

/** GO_TO: dot-scale direction, not the shortest cyclic path (see doc). */
const resolveGoToTarget = (
  layout: CarouselState["layout"],
  currentPageIndex: number,
  targetPageIndex: number,
): PageTarget => {
  const nextTargetPageIndex = layout.isFinite
    ? clamp(targetPageIndex, 0, layout.pageCount - 1)
    : normalizePageIndex(targetPageIndex, layout.pageCount);
  return {
    nextTargetPageIndex,
    pageDelta: nextTargetPageIndex - currentPageIndex,
  };
};

const stepPhase = (
  command: MoveCommand | GoToCommand,
  isInstantMode: boolean,
): MotionPhase => {
  if (command.isInstant || isInstantMode) return "step-instant";
  return command.type === "GO_TO" ? "step-jump" : "step-normal";
};

export const resolveStepTransition = (
  state: CarouselState,
  command: MoveCommand | GoToCommand,
  isInstantMode: boolean,
  motion: MotionSettings,
  isSameDirectionRepeat: boolean = false,
): StepResolution => {
  const { layout } = state;
  const stepSize = layout.visibleSlidesCount;
  const nextFromVirtualIndex = command.fromVirtualIndex ?? state.virtualIndex;
  const step = command.type === "MOVE" ? command.step : 0;
  const effectiveMoveStep = isSameDirectionRepeat
    ? repeatedClickStep(step)
    : step;
  const { currentPageIndex, currentVirtualIndex } = stepOrigin(
    state,
    nextFromVirtualIndex,
    step,
    isSameDirectionRepeat,
  );

  const { nextTargetPageIndex, pageDelta } =
    command.type === "MOVE"
      ? resolveMoveTarget(layout, currentPageIndex, effectiveMoveStep)
      : resolveGoToTarget(layout, currentPageIndex, command.targetPageIndex);

  const canonicalVirtualIndex = layout.isFinite
    ? pageStart(nextTargetPageIndex, stepSize)
    : currentVirtualIndex + pageDelta * stepSize;

  // virtualIndex stays at the preflight landing while a teleport is pending —
  // the render window is built from it, so the far target must not leak in.
  const goToPlan =
    command.type === "GO_TO" && !command.isInstant && !isInstantMode
      ? resolveGoToPlan(Math.abs(pageDelta), stepSize, motion)
      : null;
  const nextVirtualIndex = goToPlan?.isTeleport
    ? currentVirtualIndex + Math.sign(pageDelta) * goToPlan.leadDistance
    : canonicalVirtualIndex;

  return {
    nextFromVirtualIndex,
    nextTargetPageIndex,
    nextVirtualIndex,
    nextTeleportVirtualIndex: goToPlan?.isTeleport
      ? canonicalVirtualIndex
      : null,
    phase: stepPhase(command, isInstantMode),
  };
};

export const isSameDirectionRepeat = (
  state: CarouselState,
  step: number,
): boolean => {
  const direction = Math.sign(step);
  if (direction === 0) return false;
  if (state.motionPhase === "idle" || state.motionPhase === "dragging") {
    return false;
  }
  const currentDirection = Math.sign(
    state.virtualIndex - state.fromVirtualIndex,
  );
  return currentDirection === direction;
};

export const hasReachedDragTarget = (
  originVirtualIndex: number,
  targetVirtualIndex: number,
  epsilon: number,
) => Math.abs(originVirtualIndex - targetVirtualIndex) < epsilon;
