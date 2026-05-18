import {
  alignedVirtualIndex,
  clamp,
  normalizePageIndex,
  pageStart,
  shortestCyclicDistance,
} from "../domain";
import type {
  CarouselState,
  GoToCommand,
  MoveCommand,
  MotionPhase,
} from "./types";

/**
 * Picks the "from" position for the next step. `targetPageIndex` is the
 * reducer's single logical page cursor: while motion is queued it already
 * names the pending destination, and while idle it names the settled page.
 * The caller-provided origin is used only as the lane reference for a fresh
 * visual handoff.
 */
const stepOrigin = (state: CarouselState, fromVirtualIndex: number) => {
  const stepSize = state.layout.visibleSlidesCount;
  const isQueued = state.layout.canSlide && state.motionPhase !== "idle";
  const currentPageIndex = state.targetPageIndex;
  const laneReference = isQueued ? state.virtualIndex : fromVirtualIndex;
  const currentVirtualIndex = state.layout.isFinite
    ? pageStart(currentPageIndex, stepSize)
    : alignedVirtualIndex(currentPageIndex, laneReference, state.layout);

  return { currentPageIndex, currentVirtualIndex };
};

interface StepResolution {
  nextFromVirtualIndex: number;
  nextTargetPageIndex: number;
  nextVirtualIndex: number;
  phase: MotionPhase;
}

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
): StepResolution => {
  const { layout } = state;
  const stepSize = layout.visibleSlidesCount;
  const nextFromVirtualIndex = command.fromVirtualIndex ?? state.virtualIndex;
  const { currentPageIndex, currentVirtualIndex } = stepOrigin(state, nextFromVirtualIndex);

  let nextTargetPageIndex = currentPageIndex;
  let pageDelta = 0;

  if (command.type === "MOVE") {
    const raw = currentPageIndex + command.step;
    nextTargetPageIndex = layout.isFinite
      ? clamp(raw, 0, layout.pageCount - 1)
      : normalizePageIndex(raw, layout.pageCount);
    pageDelta = layout.isFinite ? nextTargetPageIndex - currentPageIndex : command.step;
  } else {
    const resolved = layout.isFinite
      ? clamp(command.targetPageIndex, 0, layout.pageCount - 1)
      : normalizePageIndex(command.targetPageIndex, layout.pageCount);
    pageDelta = layout.isFinite
      ? resolved - currentPageIndex
      : shortestCyclicDistance(currentPageIndex, resolved, layout.pageCount);
    nextTargetPageIndex = layout.isFinite
      ? resolved
      : normalizePageIndex(currentPageIndex + pageDelta, layout.pageCount);
  }

  const nextVirtualIndex = layout.isFinite
    ? pageStart(nextTargetPageIndex, stepSize)
    : currentVirtualIndex + pageDelta * stepSize;

  return {
    nextFromVirtualIndex,
    nextTargetPageIndex,
    nextVirtualIndex,
    phase: stepPhase(command, isInstantMode),
  };
};

/**
 * A repeated click is a MOVE click that arrives while the carousel is already
 * animating in the same direction. It does not change the destination model:
 * the next target is still the next page boundary. It only selects the fast
 * motion profile in the motion layer.
 */
export const isSameDirectionRepeat = (
  state: CarouselState,
  step: number,
): boolean => {
  const direction = Math.sign(step);
  if (direction === 0) return false;
  if (state.motionPhase === "idle" || state.motionPhase === "dragging") {
    return false;
  }
  const currentDirection = Math.sign(state.virtualIndex - state.fromVirtualIndex);
  return currentDirection !== 0 && currentDirection === direction;
};

export const hasReachedDragTarget = (
  originVirtualIndex: number,
  targetVirtualIndex: number,
  epsilon: number,
) => Math.abs(originVirtualIndex - targetVirtualIndex) < epsilon;
