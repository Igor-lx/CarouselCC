import {
  alignedVirtualIndex,
  clamp,
  normalizePageIndex,
  pageStart,
  shortestCyclicDistance,
} from "../domain";
import type { MotionSettings } from "../config";
import { resolveGoToPlan } from "../motion/timing";
import type {
  CarouselState,
  GoToCommand,
  MoveCommand,
  MotionPhase,
} from "./types";

const REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES = 2;

/**
 * Picks the page cursor and virtual lane for the next step.
 *
 * Default path: `targetPageIndex` is the logical cursor. During in-flight
 * motion it already names the pending destination; while idle it names the
 * settled page.
 *
 * Same-direction repeated click: the cursor is derived from the live visual
 * sample, so rapid clicks stay bounded by what the user can actually see.
 */
const stepOrigin = (
  state: CarouselState,
  fromVirtualIndex: number,
  step: number,
  isRepeatedClickAdvance: boolean,
) => {
  const stepSize = state.layout.visibleSlidesCount;
  const isQueued = state.layout.canSlide && state.motionPhase !== "idle";

  let currentPageIndex: number;
  let laneReference: number;
  if (isRepeatedClickAdvance) {
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

const repeatedClickStep = (step: number): number =>
  Math.sign(step) * REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES;

interface StepResolution {
  nextFromVirtualIndex: number;
  nextTargetPageIndex: number;
  nextVirtualIndex: number;
  /**
   * Final virtual position of a far GO_TO, or `null` for a step that does not
   * teleport. When set, `nextVirtualIndex` is the bounded preflight landing.
   */
  nextTeleportVirtualIndex: number | null;
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
  motion: MotionSettings,
  isRepeatedClickAdvance = false,
): StepResolution => {
  const { layout } = state;
  const stepSize = layout.visibleSlidesCount;
  const nextFromVirtualIndex = command.fromVirtualIndex ?? state.virtualIndex;
  const step = command.type === "MOVE" ? command.step : 0;
  const effectiveMoveStep = isRepeatedClickAdvance
    ? repeatedClickStep(step)
    : step;
  const { currentPageIndex, currentVirtualIndex } = stepOrigin(
    state,
    nextFromVirtualIndex,
    step,
    isRepeatedClickAdvance,
  );

  let nextTargetPageIndex = currentPageIndex;
  let pageDelta = 0;

  if (command.type === "MOVE") {
    const raw = currentPageIndex + effectiveMoveStep;
    nextTargetPageIndex = layout.isFinite
      ? clamp(raw, 0, layout.pageCount - 1)
      : normalizePageIndex(raw, layout.pageCount);
    pageDelta = layout.isFinite
      ? nextTargetPageIndex - currentPageIndex
      : effectiveMoveStep;
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

  // The full visual destination, before any teleport bounding is applied.
  const canonicalVirtualIndex = layout.isFinite
    ? pageStart(nextTargetPageIndex, stepSize)
    : currentVirtualIndex + pageDelta * stepSize;

  // A GO_TO over a long span animates a bounded preflight, teleports the
  // middle, then animates a fixed approach near the final target.
  // `virtualIndex` is kept at the preflight landing on purpose - the render
  // window is built from it, so it must not name the far target.
  const goToPlan =
    command.type === "GO_TO" && !command.isInstant && !isInstantMode
      ? resolveGoToPlan(Math.abs(pageDelta), stepSize, motion)
      : null;
  const isTeleport = goToPlan !== null && goToPlan.isTeleport;
  const nextVirtualIndex =
    isTeleport && goToPlan
      ? currentVirtualIndex + Math.sign(pageDelta) * goToPlan.leadDistance
      : canonicalVirtualIndex;

  return {
    nextFromVirtualIndex,
    nextTargetPageIndex,
    nextVirtualIndex,
    nextTeleportVirtualIndex: isTeleport ? canonicalVirtualIndex : null,
    phase: stepPhase(command, isInstantMode),
  };
};

/**
 * A repeated click is a MOVE click that arrives while the carousel is already
 * animating in the same direction. It selects the fast motion profile and
 * retargets to two pages ahead of the live visual page, so a click burst can
 * extend motion as the visual crosses page boundaries without building an
 * unbounded command queue.
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
