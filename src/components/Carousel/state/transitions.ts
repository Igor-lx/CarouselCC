import {
  alignedVirtualIndex,
  clamp,
  normalizePageIndex,
  pageStart,
  shortestCyclicDistance,
  type CarouselLayout,
} from "../domain";
import type { RepeatedClickSettings } from "../config";
import type {
  CarouselState,
  GoToCommand,
  MoveCommand,
  MotionPhase,
} from "./types";

/**
 * Picks the "from" position for the next step. When motion is queued or a
 * non-zero target is pending, we anchor the segment to the current target;
 * otherwise we use the caller-provided origin (typically the visually
 * sampled position) so direction-change clicks and gesture handoff produce
 * the right segment.
 */
const stepOrigin = (state: CarouselState, fromVirtualIndex: number) => {
  const stepSize = state.layout.visibleSlidesCount;
  const isQueued = state.layout.canSlide && state.motionPhase !== "idle";
  const hasPending =
    state.layout.canSlide && state.targetPageIndex !== state.activePageIndex;
  const currentPageIndex = hasPending ? state.targetPageIndex : state.activePageIndex;
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

interface RepeatedClickPlanInput {
  state: CarouselState;
  fromVirtualIndex: number;
  step: number;
  repeated: RepeatedClickSettings;
}

interface RepeatedClickPlan {
  nextTargetPageIndex: number;
  nextAdvanceVirtualIndex: number;
  followUpVirtualIndex: number | null;
}

const clampRepeatedVirtualIndex = (virtualIndex: number, layout: CarouselLayout) => {
  if (!layout.isFinite) return virtualIndex;
  const min = 0;
  const max = pageStart(layout.pageCount - 1, layout.visibleSlidesCount);
  return clamp(virtualIndex, min, max);
};

export const resolveRepeatedClickPlan = ({
  state,
  fromVirtualIndex,
  step,
  repeated,
}: RepeatedClickPlanInput): RepeatedClickPlan | null => {
  const { layout } = state;
  const direction = Math.sign(step);
  const stepSize = layout.visibleSlidesCount;
  const { epsilon } = repeated;

  if (direction === 0 || stepSize <= epsilon) return null;

  const currentDirection = Math.sign(state.virtualIndex - state.fromVirtualIndex);
  const isSameDirectionRepeat =
    state.motionPhase !== "idle" &&
    state.motionPhase !== "dragging" &&
    currentDirection !== 0 &&
    currentDirection === direction;

  if (!isSameDirectionRepeat) return null;

  const { destinationPosition } = repeated;
  const currentPageOrigin =
    direction > 0
      ? Math.floor(fromVirtualIndex / stepSize) * stepSize
      : Math.ceil(fromVirtualIndex / stepSize) * stepSize;

  const nextAdvanceVirtualIndex = clampRepeatedVirtualIndex(
    currentPageOrigin + direction * (1 + destinationPosition) * stepSize,
    layout,
  );

  const nextTargetVirtualIndex = clampRepeatedVirtualIndex(
    currentPageOrigin + direction * 2 * stepSize,
    layout,
  );

  const targetPageIndex = Math.round(nextTargetVirtualIndex / stepSize);
  const nextTargetPageIndex = layout.isFinite
    ? clamp(targetPageIndex, 0, layout.pageCount - 1)
    : normalizePageIndex(targetPageIndex, layout.pageCount);

  const followUpVirtualIndex =
    Math.abs(nextTargetVirtualIndex - nextAdvanceVirtualIndex) >= epsilon
      ? nextTargetVirtualIndex
      : null;

  return {
    nextTargetPageIndex,
    nextAdvanceVirtualIndex,
    followUpVirtualIndex,
  };
};

export const hasReachedDragTarget = (
  originVirtualIndex: number,
  targetVirtualIndex: number,
  epsilon: number,
) => Math.abs(originVirtualIndex - targetVirtualIndex) < epsilon;
